"""
AutomaERP - Backend
FastAPI + MongoDB + JWT + Stripe + Emergent Object Storage
"""
import os
import uuid
import logging
import base64
import mimetypes
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any, Literal
from contextlib import asynccontextmanager

import bcrypt
import jwt
import requests
import stripe
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Header, Query, status
from fastapi.responses import Response, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------- Config ----------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"
JWT_EXP_HOURS = 24 * 7

APP_NAME = os.environ.get("APP_NAME", "automa-erp")
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# ---------- Plans ----------
PLANS = {
    "automa_monthly":   {"name": "Mensal",     "amount": 10000, "days": 30,  "label": "R$ 100 / mês"},
    "automa_quarterly": {"name": "Trimestral", "amount": 25000, "days": 90,  "label": "R$ 250 / 3 meses"},
    "automa_yearly":    {"name": "Anual",      "amount": 90000, "days": 365, "label": "R$ 900 / ano"},
}

# ---------- Permissions ----------
ALL_TABS = ["dashboard", "agenda", "garage", "obras", "estoque", "rma", "my_agenda", "employees"]
DEFAULT_CEO_PERMS = {t: {"view": True, "edit": True} for t in ALL_TABS}

# ---------- Mongo ----------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Storage
storage_key: Optional[str] = None
def init_storage(force: bool = False) -> Optional[str]:
    global storage_key
    if storage_key and not force:
        return storage_key
    if not EMERGENT_KEY:
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        r.raise_for_status()
        storage_key = r.json()["storage_key"]
        return storage_key
    except Exception as e:
        logging.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    k = init_storage()
    if not k:
        raise HTTPException(500, "Storage unavailable")
    r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": k, "Content-Type": content_type}, data=data, timeout=120)
    if r.status_code == 404:
        k = init_storage(force=True)
        r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": k, "Content-Type": content_type}, data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def get_object(path: str):
    k = init_storage()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": k}, timeout=60)
    if r.status_code == 404:
        k = init_storage(force=True)
        r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": k}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

# ---------- Utils ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": now_utc() + timedelta(hours=JWT_EXP_HOURS), "iat": now_utc()}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def new_id() -> str:
    return str(uuid.uuid4())

def dt_iso(d: datetime) -> str:
    if isinstance(d, str):
        return d
    return d.astimezone(timezone.utc).isoformat()

def clean(doc):
    if doc is None: return None
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc

# ---------- Auth ----------
security = HTTPBearer(auto_error=False)

async def current_user(cred: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if not cred:
        raise HTTPException(401, "Não autenticado")
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(401, "Token inválido")
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(401, "Usuário não encontrado")
    return user

async def get_company_and_perms(user):
    """Return (company_doc, permissions_dict, is_ceo)."""
    company_id = user.get("company_id")
    if not company_id:
        return None, {}, False
    company = await db.companies.find_one({"id": company_id})
    if not company:
        return None, {}, False
    is_ceo = user["id"] == company["ceo_user_id"]
    perms = DEFAULT_CEO_PERMS if is_ceo else user.get("permissions", {})
    return company, perms, is_ceo

async def require_subscription(user):
    """Only owners/CEO need to have paid subscription; employees inherit access via company."""
    company, _, is_ceo = await get_company_and_perms(user)
    if not company:
        raise HTTPException(403, "Nenhuma empresa vinculada")
    expires = company.get("subscription_expires_at")
    if not expires:
        raise HTTPException(402, "Assinatura necessária")
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if expires < now_utc():
        raise HTTPException(402, "Assinatura expirada")
    return company

def check_perm(perms: Dict, tab: str, action: str = "view") -> bool:
    p = perms.get(tab)
    if not p: return False
    return bool(p.get(action, False))

async def require_tab(user, tab: str, action: str = "view"):
    company = await require_subscription(user)
    _, perms, is_ceo = await get_company_and_perms(user)
    if not is_ceo and not check_perm(perms, tab, action):
        raise HTTPException(403, f"Sem permissão para {action} em {tab}")
    return company

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class CompanyIn(BaseModel):
    name: str
    cnpj: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""

class EmployeeIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role: str
    permissions: Dict[str, Dict[str, bool]] = {}

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    permissions: Optional[Dict[str, Dict[str, bool]]] = None
    password: Optional[str] = None

class ClientIn(BaseModel):
    name: str
    contact_name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: str = ""
    notes: Optional[str] = ""

class VehicleIn(BaseModel):
    plate: str
    model: str
    year: Optional[int] = None
    km: int = 0
    status: Literal["available", "in_use", "maintenance"] = "available"
    notes: Optional[str] = ""

class MaintenanceIn(BaseModel):
    description: str
    date: Optional[str] = None
    km: Optional[int] = None

class CategoryIn(BaseModel):
    name: str

class ProductIn(BaseModel):
    name: str
    category_id: str
    sku: Optional[str] = ""
    quantity: int = 0
    unit: Optional[str] = "un"
    photo_path: Optional[str] = ""
    notes: Optional[str] = ""

class StockAdjust(BaseModel):
    delta: int
    reason: str

class OSMaterial(BaseModel):
    product_id: str
    quantity_taken: int
    quantity_used: Optional[int] = None

class OSIn(BaseModel):
    client_id: str
    title: str
    description: Optional[str] = ""
    scheduled_date: str  # YYYY-MM-DD
    start_time: str      # HH:MM
    end_time: str        # HH:MM
    employee_ids: List[str] = []
    vehicle_id: Optional[str] = None
    materials: List[OSMaterial] = []

class OSFinalize(BaseModel):
    materials_used: List[OSMaterial]
    signature_base64: Optional[str] = None
    notes: Optional[str] = ""

class RMAIn(BaseModel):
    product_id: str
    serial_number: str
    problem: str

class NoteIn(BaseModel):
    text: str

class CheckoutIn(BaseModel):
    lookup_key: str
    origin_url: str

# ---------- App ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_storage()
    # index
    try:
        await db.users.create_index("email", unique=True)
        await db.companies.create_index("cnpj", unique=True, sparse=True)
    except Exception as e:
        logging.warning(f"index: {e}")
    yield
    client.close()

app = FastAPI(lifespan=lifespan)
api = APIRouter(prefix="/api")

# =====================================================
# AUTH
# =====================================================
@api.post("/auth/register")
async def register(body: RegisterIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(400, "Email já cadastrado")
    user = {
        "id": new_id(),
        "email": body.email.lower(),
        "password_hash": hash_pw(body.password),
        "name": body.name,
        "company_id": None,
        "permissions": {},
        "role": "owner",
        "created_at": dt_iso(now_utc()),
    }
    await db.users.insert_one(user)
    token = create_token(user["id"])
    return {"token": token, "user": clean(user)}

@api.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_pw(body.password, user["password_hash"]):
        raise HTTPException(401, "Credenciais inválidas")
    token = create_token(user["id"])
    return {"token": token, "user": clean(dict(user))}

@api.get("/auth/me")
async def me(user=Depends(current_user)):
    company, perms, is_ceo = await get_company_and_perms(user)
    subscription_active = False
    if company and company.get("subscription_expires_at"):
        exp = company["subscription_expires_at"]
        if isinstance(exp, str): exp = datetime.fromisoformat(exp)
        subscription_active = exp > now_utc()
    return {
        "user": clean(dict(user)),
        "company": clean(dict(company)) if company else None,
        "permissions": perms,
        "is_ceo": is_ceo,
        "subscription_active": subscription_active,
    }

# =====================================================
# COMPANY
# =====================================================
@api.post("/companies")
async def create_company(body: CompanyIn, user=Depends(current_user)):
    if user.get("company_id"):
        raise HTTPException(400, "Usuário já vinculado a uma empresa")
    # verify subscription: user must have a paid, unused transaction
    txn = await db.payment_transactions.find_one({
        "user_id": user["id"], "payment_status": "paid", "consumed": {"$ne": True}
    })
    if not txn:
        raise HTTPException(402, "Assinatura necessária para criar empresa")
    plan = PLANS.get(txn["lookup_key"])
    if not plan:
        raise HTTPException(400, "Plano inválido")
    expires = now_utc() + timedelta(days=plan["days"])
    company = {
        "id": new_id(),
        "name": body.name,
        "cnpj": body.cnpj,
        "email": body.email,
        "phone": body.phone,
        "address": body.address,
        "ceo_user_id": user["id"],
        "subscription_expires_at": dt_iso(expires),
        "current_plan": txn["lookup_key"],
        "created_at": dt_iso(now_utc()),
    }
    await db.companies.insert_one(company)
    await db.users.update_one({"id": user["id"]}, {"$set": {"company_id": company["id"], "role": "ceo"}})
    await db.payment_transactions.update_one({"session_id": txn["session_id"]}, {"$set": {"consumed": True, "company_id": company["id"]}})
    return {"company": clean(dict(company))}

@api.put("/companies/me")
async def update_company(body: CompanyIn, user=Depends(current_user)):
    company, _, is_ceo = await get_company_and_perms(user)
    if not company or not is_ceo:
        raise HTTPException(403, "Somente CEO pode editar")
    await db.companies.update_one({"id": company["id"]}, {"$set": body.model_dump()})
    updated = await db.companies.find_one({"id": company["id"]})
    return {"company": clean(dict(updated))}

# =====================================================
# EMPLOYEES
# =====================================================
@api.get("/employees")
async def list_employees(user=Depends(current_user)):
    company = await require_subscription(user)
    emps = await db.users.find({"company_id": company["id"]}, {"password_hash": 0, "_id": 0}).to_list(500)
    return {"employees": emps}

@api.post("/employees")
async def create_employee(body: EmployeeIn, user=Depends(current_user)):
    company, _, is_ceo = await get_company_and_perms(user)
    if not is_ceo:
        raise HTTPException(403, "Somente CEO cadastra funcionário")
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(400, "Email já usado")
    emp = {
        "id": new_id(),
        "email": body.email.lower(),
        "password_hash": hash_pw(body.password),
        "name": body.name,
        "role": body.role,
        "company_id": company["id"],
        "permissions": body.permissions or {},
        "created_at": dt_iso(now_utc()),
    }
    await db.users.insert_one(emp)
    return {"employee": clean(dict(emp))}

@api.put("/employees/{emp_id}")
async def update_employee(emp_id: str, body: EmployeeUpdate, user=Depends(current_user)):
    company, _, is_ceo = await get_company_and_perms(user)
    if not is_ceo:
        raise HTTPException(403, "Somente CEO edita")
    emp = await db.users.find_one({"id": emp_id, "company_id": company["id"]})
    if not emp: raise HTTPException(404, "Funcionário não encontrado")
    update = {k: v for k, v in body.model_dump().items() if v is not None and k != "password"}
    if body.password:
        update["password_hash"] = hash_pw(body.password)
    await db.users.update_one({"id": emp_id}, {"$set": update})
    updated = await db.users.find_one({"id": emp_id})
    return {"employee": clean(dict(updated))}

@api.delete("/employees/{emp_id}")
async def delete_employee(emp_id: str, user=Depends(current_user)):
    company, _, is_ceo = await get_company_and_perms(user)
    if not is_ceo:
        raise HTTPException(403, "Somente CEO exclui")
    if emp_id == company["ceo_user_id"]:
        raise HTTPException(400, "CEO não pode ser excluído")
    await db.users.delete_one({"id": emp_id, "company_id": company["id"]})
    return {"ok": True}

# =====================================================
# CLIENTS (Obras)
# =====================================================
@api.get("/clients")
async def list_clients(user=Depends(current_user)):
    company = await require_tab(user, "obras", "view")
    items = await db.clients.find({"company_id": company["id"]}, {"_id": 0}).to_list(1000)
    return {"clients": items}

@api.post("/clients")
async def create_client(body: ClientIn, user=Depends(current_user)):
    company = await require_tab(user, "obras", "edit")
    c = {"id": new_id(), "company_id": company["id"], **body.model_dump(), "created_at": dt_iso(now_utc())}
    await db.clients.insert_one(c)
    return {"client": clean(dict(c))}

@api.put("/clients/{cid}")
async def update_client(cid: str, body: ClientIn, user=Depends(current_user)):
    company = await require_tab(user, "obras", "edit")
    await db.clients.update_one({"id": cid, "company_id": company["id"]}, {"$set": body.model_dump()})
    c = await db.clients.find_one({"id": cid})
    return {"client": clean(dict(c))}

@api.delete("/clients/{cid}")
async def delete_client(cid: str, user=Depends(current_user)):
    company = await require_tab(user, "obras", "edit")
    await db.clients.delete_one({"id": cid, "company_id": company["id"]})
    return {"ok": True}

@api.get("/clients/{cid}/history")
async def client_history(cid: str, user=Depends(current_user)):
    company = await require_tab(user, "obras", "view")
    orders = await db.orders.find({"company_id": company["id"], "client_id": cid}, {"_id": 0}).sort("scheduled_date", -1).to_list(1000)
    return {"history": orders}

# =====================================================
# VEHICLES (Garage)
# =====================================================
@api.get("/vehicles")
async def list_vehicles(user=Depends(current_user)):
    company = await require_tab(user, "garage", "view")
    v = await db.vehicles.find({"company_id": company["id"]}, {"_id": 0}).to_list(500)
    return {"vehicles": v}

@api.post("/vehicles")
async def create_vehicle(body: VehicleIn, user=Depends(current_user)):
    company = await require_tab(user, "garage", "edit")
    v = {"id": new_id(), "company_id": company["id"], **body.model_dump(), "maintenance_history": [], "created_at": dt_iso(now_utc())}
    await db.vehicles.insert_one(v)
    return {"vehicle": clean(dict(v))}

@api.put("/vehicles/{vid}")
async def update_vehicle(vid: str, body: VehicleIn, user=Depends(current_user)):
    company = await require_tab(user, "garage", "edit")
    await db.vehicles.update_one({"id": vid, "company_id": company["id"]}, {"$set": body.model_dump()})
    v = await db.vehicles.find_one({"id": vid})
    return {"vehicle": clean(dict(v))}

@api.delete("/vehicles/{vid}")
async def delete_vehicle(vid: str, user=Depends(current_user)):
    company = await require_tab(user, "garage", "edit")
    await db.vehicles.delete_one({"id": vid, "company_id": company["id"]})
    return {"ok": True}

@api.post("/vehicles/{vid}/maintenance")
async def add_maintenance(vid: str, body: MaintenanceIn, user=Depends(current_user)):
    company = await require_tab(user, "garage", "edit")
    entry = {"id": new_id(), **body.model_dump(), "created_at": dt_iso(now_utc())}
    await db.vehicles.update_one({"id": vid, "company_id": company["id"]}, {"$push": {"maintenance_history": entry}, "$set": {"status": "maintenance"}})
    return {"entry": entry}

# =====================================================
# STOCK (Estoque)
# =====================================================
@api.get("/categories")
async def list_categories(user=Depends(current_user)):
    company = await require_tab(user, "estoque", "view")
    items = await db.categories.find({"company_id": company["id"]}, {"_id": 0}).to_list(500)
    return {"categories": items}

@api.post("/categories")
async def create_category(body: CategoryIn, user=Depends(current_user)):
    company = await require_tab(user, "estoque", "edit")
    c = {"id": new_id(), "company_id": company["id"], "name": body.name, "created_at": dt_iso(now_utc())}
    await db.categories.insert_one(c)
    return {"category": clean(dict(c))}

@api.delete("/categories/{cid}")
async def delete_category(cid: str, user=Depends(current_user)):
    company = await require_tab(user, "estoque", "edit")
    await db.categories.delete_one({"id": cid, "company_id": company["id"]})
    return {"ok": True}

@api.get("/products")
async def list_products(user=Depends(current_user)):
    company = await require_tab(user, "estoque", "view")
    items = await db.products.find({"company_id": company["id"]}, {"_id": 0}).to_list(2000)
    return {"products": items}

@api.post("/products")
async def create_product(body: ProductIn, user=Depends(current_user)):
    company = await require_tab(user, "estoque", "edit")
    p = {"id": new_id(), "company_id": company["id"], **body.model_dump(), "reserved": 0, "created_at": dt_iso(now_utc())}
    await db.products.insert_one(p)
    return {"product": clean(dict(p))}

@api.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn, user=Depends(current_user)):
    company = await require_tab(user, "estoque", "edit")
    await db.products.update_one({"id": pid, "company_id": company["id"]}, {"$set": body.model_dump()})
    p = await db.products.find_one({"id": pid})
    return {"product": clean(dict(p))}

@api.delete("/products/{pid}")
async def delete_product(pid: str, user=Depends(current_user)):
    company = await require_tab(user, "estoque", "edit")
    await db.products.delete_one({"id": pid, "company_id": company["id"]})
    return {"ok": True}

@api.post("/products/{pid}/adjust")
async def adjust_stock(pid: str, body: StockAdjust, user=Depends(current_user)):
    company = await require_tab(user, "estoque", "edit")
    p = await db.products.find_one({"id": pid, "company_id": company["id"]})
    if not p: raise HTTPException(404, "Produto não encontrado")
    new_q = p["quantity"] + body.delta
    if new_q < 0: raise HTTPException(400, "Estoque insuficiente")
    await db.products.update_one({"id": pid}, {"$set": {"quantity": new_q}})
    await db.stock_movements.insert_one({
        "id": new_id(), "company_id": company["id"], "product_id": pid,
        "delta": body.delta, "reason": body.reason, "user_id": user["id"], "created_at": dt_iso(now_utc())
    })
    return {"product": {**clean(dict(p)), "quantity": new_q}}

# =====================================================
# ORDERS (Agenda / O.S.)
# =====================================================
async def _reserve_materials(company_id: str, materials: List[Dict]):
    for m in materials:
        p = await db.products.find_one({"id": m["product_id"], "company_id": company_id})
        if not p: raise HTTPException(400, f"Produto {m['product_id']} não encontrado")
        available = p["quantity"] - p.get("reserved", 0)
        if available < m["quantity_taken"]:
            raise HTTPException(400, f"Estoque insuficiente para {p['name']}")
    for m in materials:
        await db.products.update_one({"id": m["product_id"]}, {"$inc": {"reserved": m["quantity_taken"]}})

async def _release_reservation(company_id: str, materials: List[Dict], used: List[Dict]):
    used_map = {u["product_id"]: u["quantity_used"] for u in used}
    for m in materials:
        pid = m["product_id"]
        taken = m["quantity_taken"]
        u = used_map.get(pid, taken)
        await db.products.update_one({"id": pid, "company_id": company_id}, {"$inc": {"reserved": -taken, "quantity": -u}})
        await db.stock_movements.insert_one({
            "id": new_id(), "company_id": company_id, "product_id": pid,
            "delta": -u, "reason": "Uso em O.S.", "created_at": dt_iso(now_utc())
        })

@api.get("/orders")
async def list_orders(user=Depends(current_user)):
    company = await require_tab(user, "agenda", "view")
    orders = await db.orders.find({"company_id": company["id"]}, {"_id": 0}).sort("scheduled_date", 1).to_list(2000)
    return {"orders": orders}

@api.get("/orders/mine")
async def list_my_orders(user=Depends(current_user)):
    company = await require_subscription(user)
    orders = await db.orders.find({"company_id": company["id"], "employee_ids": user["id"]}, {"_id": 0}).sort("scheduled_date", 1).to_list(500)
    return {"orders": orders}

@api.get("/orders/{oid}")
async def get_order(oid: str, user=Depends(current_user)):
    company = await require_subscription(user)
    o = await db.orders.find_one({"id": oid, "company_id": company["id"]})
    if not o: raise HTTPException(404, "O.S. não encontrada")
    return {"order": clean(dict(o))}

@api.post("/orders")
async def create_order(body: OSIn, user=Depends(current_user)):
    company = await require_tab(user, "agenda", "edit")
    client_doc = await db.clients.find_one({"id": body.client_id, "company_id": company["id"]})
    if not client_doc: raise HTTPException(400, "Cliente inválido")
    # snapshot client info
    client_snapshot = {"name": client_doc["name"], "address": client_doc.get("address", ""), "phone": client_doc.get("phone", ""), "contact_name": client_doc.get("contact_name", "")}
    # pull last order for this client for auto-fill notes
    last = await db.orders.find_one({"company_id": company["id"], "client_id": body.client_id}, sort=[("scheduled_date", -1)])
    last_notes = last.get("description", "") if last else ""
    materials = [m.model_dump() for m in body.materials]
    if materials:
        await _reserve_materials(company["id"], materials)
    o = {
        "id": new_id(),
        "company_id": company["id"],
        "client_id": body.client_id,
        "client_snapshot": client_snapshot,
        "previous_notes": last_notes,
        "title": body.title,
        "description": body.description,
        "scheduled_date": body.scheduled_date,
        "start_time": body.start_time,
        "end_time": body.end_time,
        "employee_ids": body.employee_ids,
        "vehicle_id": body.vehicle_id,
        "materials": materials,
        "materials_used": [],
        "attachments": [],
        "signature_path": None,
        "status": "scheduled",
        "created_by": user["id"],
        "created_at": dt_iso(now_utc()),
    }
    await db.orders.insert_one(o)
    if body.vehicle_id:
        await db.vehicles.update_one({"id": body.vehicle_id, "company_id": company["id"]}, {"$set": {"status": "in_use"}})
    return {"order": clean(dict(o))}

@api.put("/orders/{oid}")
async def update_order(oid: str, body: OSIn, user=Depends(current_user)):
    company = await require_tab(user, "agenda", "edit")
    existing = await db.orders.find_one({"id": oid, "company_id": company["id"]})
    if not existing: raise HTTPException(404, "O.S. não encontrada")
    # release old reservations, then reserve new
    if existing.get("status") != "finalized":
        old_mats = existing.get("materials", [])
        for m in old_mats:
            await db.products.update_one({"id": m["product_id"]}, {"$inc": {"reserved": -m["quantity_taken"]}})
    new_mats = [m.model_dump() for m in body.materials]
    if new_mats:
        await _reserve_materials(company["id"], new_mats)
    upd = body.model_dump()
    upd["materials"] = new_mats
    await db.orders.update_one({"id": oid}, {"$set": upd})
    o = await db.orders.find_one({"id": oid})
    return {"order": clean(dict(o))}

@api.delete("/orders/{oid}")
async def delete_order(oid: str, user=Depends(current_user)):
    company = await require_tab(user, "agenda", "edit")
    o = await db.orders.find_one({"id": oid, "company_id": company["id"]})
    if not o: raise HTTPException(404, "O.S. não encontrada")
    if o.get("status") != "finalized":
        for m in o.get("materials", []):
            await db.products.update_one({"id": m["product_id"]}, {"$inc": {"reserved": -m["quantity_taken"]}})
    if o.get("vehicle_id"):
        await db.vehicles.update_one({"id": o["vehicle_id"]}, {"$set": {"status": "available"}})
    await db.orders.delete_one({"id": oid})
    return {"ok": True}

@api.post("/orders/{oid}/finalize")
async def finalize_order(oid: str, body: OSFinalize, user=Depends(current_user)):
    company = await require_subscription(user)
    o = await db.orders.find_one({"id": oid, "company_id": company["id"]})
    if not o: raise HTTPException(404, "O.S. não encontrada")
    if o.get("status") == "finalized": raise HTTPException(400, "Já finalizada")
    used = [m.model_dump() for m in body.materials_used]
    await _release_reservation(company["id"], o.get("materials", []), used)
    sig_path = None
    if body.signature_base64:
        b64 = body.signature_base64.split(",", 1)[-1]
        raw = base64.b64decode(b64)
        path = f"{APP_NAME}/signatures/{company['id']}/{oid}.png"
        put_object(path, raw, "image/png")
        sig_path = path
    upd = {"status": "finalized", "finalized_at": dt_iso(now_utc()), "materials_used": used, "final_notes": body.notes}
    if sig_path: upd["signature_path"] = sig_path
    await db.orders.update_one({"id": oid}, {"$set": upd})
    if o.get("vehicle_id"):
        await db.vehicles.update_one({"id": o["vehicle_id"]}, {"$set": {"status": "available"}})
    o2 = await db.orders.find_one({"id": oid})
    return {"order": clean(dict(o2))}

# =====================================================
# RMA
# =====================================================
@api.get("/rma")
async def list_rma(user=Depends(current_user)):
    company = await require_tab(user, "rma", "view")
    items = await db.rma.find({"company_id": company["id"]}, {"_id": 0}).to_list(1000)
    return {"rma": items}

@api.post("/rma")
async def create_rma(body: RMAIn, user=Depends(current_user)):
    company = await require_tab(user, "rma", "edit")
    p = await db.products.find_one({"id": body.product_id, "company_id": company["id"]})
    if not p: raise HTTPException(400, "Produto não encontrado")
    if p["quantity"] < 1: raise HTTPException(400, "Sem estoque para dar baixa em RMA")
    await db.products.update_one({"id": body.product_id}, {"$inc": {"quantity": -1}})
    await db.stock_movements.insert_one({
        "id": new_id(), "company_id": company["id"], "product_id": body.product_id,
        "delta": -1, "reason": "RMA - defeito", "created_at": dt_iso(now_utc())
    })
    item = {
        "id": new_id(), "company_id": company["id"],
        "product_id": body.product_id, "product_name": p["name"],
        "serial_number": body.serial_number, "problem": body.problem,
        "status": "open", "created_at": dt_iso(now_utc()),
    }
    await db.rma.insert_one(item)
    return {"rma": clean(dict(item))}

@api.delete("/rma/{rid}")
async def delete_rma(rid: str, user=Depends(current_user)):
    company = await require_tab(user, "rma", "edit")
    await db.rma.delete_one({"id": rid, "company_id": company["id"]})
    return {"ok": True}

# =====================================================
# NOTES (CEO messages on dashboard)
# =====================================================
@api.get("/notes")
async def list_notes(user=Depends(current_user)):
    company = await require_subscription(user)
    notes = await db.notes.find({"company_id": company["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"notes": notes}

@api.post("/notes")
async def create_note(body: NoteIn, user=Depends(current_user)):
    company, _, is_ceo = await get_company_and_perms(user)
    if not company: raise HTTPException(403, "Sem empresa")
    # ceo or permission edit on dashboard
    _, perms, _ = await get_company_and_perms(user)
    if not is_ceo and not check_perm(perms, "dashboard", "edit"):
        raise HTTPException(403, "Sem permissão")
    n = {"id": new_id(), "company_id": company["id"], "text": body.text, "author": user["name"], "created_at": dt_iso(now_utc())}
    await db.notes.insert_one(n)
    return {"note": clean(dict(n))}

@api.delete("/notes/{nid}")
async def delete_note(nid: str, user=Depends(current_user)):
    company, _, is_ceo = await get_company_and_perms(user)
    if not is_ceo: raise HTTPException(403, "Somente CEO")
    await db.notes.delete_one({"id": nid, "company_id": company["id"]})
    return {"ok": True}

# =====================================================
# UPLOAD / FILES
# =====================================================
@api.post("/upload")
async def upload_file(request: Request, user=Depends(current_user)):
    company = await require_subscription(user)
    form = await request.form()
    f = form.get("file")
    if not f: raise HTTPException(400, "Arquivo ausente")
    ext = (f.filename.rsplit(".", 1)[-1] if "." in f.filename else "bin").lower()
    ct = f.content_type or (mimetypes.guess_type(f.filename)[0] or "application/octet-stream")
    data = await f.read()
    path = f"{APP_NAME}/uploads/{company['id']}/{new_id()}.{ext}"
    result = put_object(path, data, ct)
    doc = {
        "id": new_id(), "company_id": company["id"],
        "storage_path": result["path"], "filename": f.filename,
        "content_type": ct, "size": result.get("size", len(data)),
        "uploaded_by": user["id"], "created_at": dt_iso(now_utc()),
    }
    await db.files.insert_one(doc)
    return {"file": clean(dict(doc))}

@api.post("/orders/{oid}/attach")
async def attach_to_order(oid: str, request: Request, user=Depends(current_user)):
    company = await require_subscription(user)
    o = await db.orders.find_one({"id": oid, "company_id": company["id"]})
    if not o: raise HTTPException(404, "O.S. não encontrada")
    form = await request.form()
    f = form.get("file")
    if not f: raise HTTPException(400, "Arquivo ausente")
    ext = (f.filename.rsplit(".", 1)[-1] if "." in f.filename else "bin").lower()
    ct = f.content_type or (mimetypes.guess_type(f.filename)[0] or "application/octet-stream")
    data = await f.read()
    path = f"{APP_NAME}/orders/{company['id']}/{oid}/{new_id()}.{ext}"
    result = put_object(path, data, ct)
    entry = {"id": new_id(), "path": result["path"], "filename": f.filename, "content_type": ct}
    await db.orders.update_one({"id": oid}, {"$push": {"attachments": entry}})
    return {"attachment": entry}

@api.get("/files")
async def get_file(path: str = Query(...), token: str = Query(...)):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(401, "Token inválido")
    u = await db.users.find_one({"id": user_id})
    if not u: raise HTTPException(401, "Usuário inválido")
    # ensure path starts with app name and belongs to a company the user is on
    if not path.startswith(APP_NAME + "/"):
        raise HTTPException(403, "Acesso negado")
    if u.get("company_id") and f"/{u['company_id']}/" not in path:
        raise HTTPException(403, "Acesso negado")
    data, ct = get_object(path)
    return Response(content=data, media_type=ct)

# =====================================================
# PAYMENTS (Stripe)
# =====================================================
@api.get("/plans")
async def get_plans():
    return {"plans": [
        {"lookup_key": k, **v} for k, v in PLANS.items()
    ]}

@api.post("/payments/checkout")
async def create_checkout(body: CheckoutIn, user=Depends(current_user)):
    if body.lookup_key not in PLANS:
        raise HTTPException(400, "Plano inválido")
    plan = PLANS[body.lookup_key]
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": "brl",
                "product_data": {"name": f"AutomaERP - {plan['name']}"},
                "unit_amount": plan["amount"],
            },
            "quantity": 1,
        }],
        success_url=f"{body.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{body.origin_url}/payment/cancel",
        metadata={"user_id": user["id"], "lookup_key": body.lookup_key},
    )
    await db.payment_transactions.insert_one({
        "session_id": session.id, "user_id": user["id"], "lookup_key": body.lookup_key,
        "amount": plan["amount"], "currency": "brl",
        "status": "initiated", "payment_status": "pending", "consumed": False,
        "created_at": dt_iso(now_utc()), "updated_at": dt_iso(now_utc()),
    })
    return {"checkout_url": session.url, "session_id": session.id}

@api.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    rec = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not rec: raise HTTPException(404, "Não encontrado")
    if rec.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid", "updated_at": dt_iso(now_utc())}},
                )
                rec = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        except stripe.error.StripeError:
            pass
    # If paid but user has no company yet, extend/renew subscription for existing company
    if rec.get("payment_status") == "paid" and not rec.get("consumed"):
        user = await db.users.find_one({"id": rec["user_id"]})
        if user and user.get("company_id"):
            plan = PLANS[rec["lookup_key"]]
            comp = await db.companies.find_one({"id": user["company_id"]})
            base = now_utc()
            if comp and comp.get("subscription_expires_at"):
                exp = comp["subscription_expires_at"]
                if isinstance(exp, str): exp = datetime.fromisoformat(exp)
                if exp > base: base = exp
            new_exp = base + timedelta(days=plan["days"])
            await db.companies.update_one({"id": user["company_id"]}, {"$set": {"subscription_expires_at": dt_iso(new_exp), "current_plan": rec["lookup_key"]}})
            await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"consumed": True, "company_id": user["company_id"]}})
    return {"session_id": rec["session_id"], "status": rec["status"], "payment_status": rec["payment_status"], "lookup_key": rec.get("lookup_key")}

@api.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(400, "Assinatura inválida")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"), "updated_at": dt_iso(now_utc())}},
        )
    return {"status": "ok"}

# =====================================================
# HEALTH
# =====================================================
@api.get("/")
async def root():
    return {"service": "AutomaERP API", "ok": True}

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
