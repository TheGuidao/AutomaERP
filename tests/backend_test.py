import os, sys, json, base64, io, requests
from pymongo import MongoClient
from datetime import datetime, timezone, timedelta

BASE = "https://work-sync-45.preview.emergentagent.com/api"
MONGO_URL = "mongodb://localhost:27017"
DB = "automa_erp"

mc = MongoClient(MONGO_URL)[DB]
# Fresh DB
for c in ["users","companies","payment_transactions","clients","vehicles","categories","products","orders","rma","notes","files","stock_movements"]:
    mc[c].delete_many({})

results = {"passed":[], "failed":[]}
def ok(name): results["passed"].append(name); print("PASS:", name)
def fail(name, ev): results["failed"].append({"name":name,"evidence":str(ev)[:400]}); print("FAIL:", name, ev)

s = requests.Session()

# 1. Register
r = s.post(f"{BASE}/auth/register", json={"email":"guibitt85@gmail.com","password":"Test1234!","name":"Guilherme"})
assert r.status_code==200, r.text
token = r.json()["token"]; ok("register")
H = {"Authorization": f"Bearer {token}"}

# 2. Login + me (no company)
r = s.post(f"{BASE}/auth/login", json={"email":"guibitt85@gmail.com","password":"Test1234!"})
assert r.status_code==200, r.text; token=r.json()["token"]; H={"Authorization":f"Bearer {token}"}
me = s.get(f"{BASE}/auth/me", headers=H).json()
assert me["company"] is None, me; ok("login+me no company")

# 3. Plans
r = s.get(f"{BASE}/plans").json()
plans = {p["lookup_key"]: p for p in r["plans"]}
assert plans["automa_monthly"]["amount"]==10000
assert plans["automa_quarterly"]["amount"]==25000
assert plans["automa_yearly"]["amount"]==90000
ok("plans")

# 4. Checkout requires JWT
r = s.post(f"{BASE}/payments/checkout", json={"lookup_key":"automa_monthly","origin_url":"https://x.com"})
assert r.status_code==401 or r.status_code==403, r.status_code
r = s.post(f"{BASE}/payments/checkout", headers=H, json={"lookup_key":"automa_monthly","origin_url":"https://x.com"})
assert r.status_code==200, r.text
data=r.json(); assert data["checkout_url"] and data["session_id"]; sess=data["session_id"]
# simulate paid
mc.payment_transactions.update_one({"session_id":sess},{"$set":{"payment_status":"paid","status":"completed"}})
r = s.get(f"{BASE}/payments/status/{sess}", headers=H).json()
assert r["payment_status"]=="paid", r; ok("checkout+paid simulate")

# 5. Create company without paid -> 402 (need another user)
r2 = s.post(f"{BASE}/auth/register", json={"email":"u2@x.com","password":"Test1234!","name":"U2"})
t2=r2.json()["token"]; H2={"Authorization":f"Bearer {t2}"}
r = s.post(f"{BASE}/companies", headers=H2, json={"name":"X","cnpj":"00000000000001"})
assert r.status_code==402, r.text; ok("company without payment = 402")

# 6. Create company with paid
r = s.post(f"{BASE}/companies", headers=H, json={"name":"AutomaCo","cnpj":"11111111000191","email":"c@x.com","phone":"11","address":"rua"})
assert r.status_code==200, r.text; comp=r.json()["company"]; ok("create company")

me = s.get(f"{BASE}/auth/me", headers=H).json()
assert me["is_ceo"] and me["subscription_active"] and me["permissions"].get("agenda",{}).get("edit"), me
ok("me = ceo + subscription + full perms")

# 7. CRUD flow
r = s.post(f"{BASE}/clients", headers=H, json={"name":"Cliente1","address":"end"}); assert r.status_code==200; cli=r.json()["client"]
assert len(s.get(f"{BASE}/clients", headers=H).json()["clients"])==1
r = s.post(f"{BASE}/vehicles", headers=H, json={"plate":"ABC1D23","model":"Van","km":0}); assert r.status_code==200; veh=r.json()["vehicle"]
r = s.post(f"{BASE}/categories", headers=H, json={"name":"Cat1"}); assert r.status_code==200; cat=r.json()["category"]
r = s.post(f"{BASE}/products", headers=H, json={"name":"Prod1","category_id":cat["id"],"quantity":10}); assert r.status_code==200; prod=r.json()["product"]
ok("crud clients/vehicles/categories/products")

# 8. Materials reservation
r = s.post(f"{BASE}/orders", headers=H, json={
    "client_id":cli["id"],"title":"OS1","scheduled_date":"2026-01-10","start_time":"09:00","end_time":"11:00",
    "vehicle_id":veh["id"],"materials":[{"product_id":prod["id"],"quantity_taken":3}]
})
assert r.status_code==200, r.text; os1=r.json()["order"]
p = mc.products.find_one({"id":prod["id"]}); assert p["reserved"]==3, p
v = mc.vehicles.find_one({"id":veh["id"]}); assert v["status"]=="in_use", v
ok("reserve materials + vehicle in_use")

# finalize with qty_used=2
png = base64.b64encode(bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082")).decode()
r = s.post(f"{BASE}/orders/{os1['id']}/finalize", headers=H, json={
    "materials_used":[{"product_id":prod["id"],"quantity_taken":3,"quantity_used":2}],
    "signature_base64": f"data:image/png;base64,{png}"
})
if r.status_code!=200:
    fail("finalize", r.text)
else:
    p = mc.products.find_one({"id":prod["id"]})
    assert p["quantity"]==8 and p["reserved"]==0, p
    v = mc.vehicles.find_one({"id":veh["id"]}); assert v["status"]=="available", v
    ok("finalize: qty=8 reserved=0 vehicle available")

# 9. Client history + previous_notes
r1 = s.post(f"{BASE}/orders", headers=H, json={"client_id":cli["id"],"title":"OS-A","description":"noteA","scheduled_date":"2026-02-01","start_time":"09:00","end_time":"10:00"}).json()["order"]
r2r = s.post(f"{BASE}/orders", headers=H, json={"client_id":cli["id"],"title":"OS-B","scheduled_date":"2026-03-01","start_time":"09:00","end_time":"10:00"}).json()["order"]
hist = s.get(f"{BASE}/clients/{cli['id']}/history", headers=H).json()["history"]
assert len(hist)>=2 and hist[0]["scheduled_date"]>=hist[1]["scheduled_date"], hist
assert r2r["previous_notes"]=="noteA", r2r
ok("client history + previous_notes")

# 10. RMA reduces stock
before = mc.products.find_one({"id":prod["id"]})["quantity"]
r = s.post(f"{BASE}/rma", headers=H, json={"product_id":prod["id"],"serial_number":"SN1","problem":"defect"})
assert r.status_code==200, r.text
after = mc.products.find_one({"id":prod["id"]})["quantity"]
assert after==before-1; ok("rma -1")

# 11. Notes
r = s.post(f"{BASE}/notes", headers=H, json={"text":"hello"}); assert r.status_code==200; ok("notes")

# 12. Employee limited perms
emp_perms = {"obras":{"view":True,"edit":False}, "estoque":{"view":False,"edit":False}}
r = s.post(f"{BASE}/employees", headers=H, json={"name":"E1","email":"emp@x.com","password":"Emp1234!","role":"tech","permissions":emp_perms})
assert r.status_code==200, r.text
te = s.post(f"{BASE}/auth/login", json={"email":"emp@x.com","password":"Emp1234!"}).json()["token"]
HE={"Authorization":f"Bearer {te}"}
assert s.get(f"{BASE}/clients", headers=HE).status_code==200
assert s.post(f"{BASE}/clients", headers=HE, json={"name":"x","address":"y"}).status_code==403
assert s.get(f"{BASE}/products", headers=HE).status_code==403
ok("employee permissions enforced")

# 13. Subscription expiry
mc.companies.update_one({"id":comp["id"]},{"$set":{"subscription_expires_at":(datetime.now(timezone.utc)-timedelta(days=1)).isoformat()}})
r = s.get(f"{BASE}/orders", headers=H)
assert r.status_code==402, r.status_code; ok("subscription expiry -> 402")
# restore
mc.companies.update_one({"id":comp["id"]},{"$set":{"subscription_expires_at":(datetime.now(timezone.utc)+timedelta(days=30)).isoformat()}})

# 14. Tenant isolation - u2 registers, pays, creates own company
r = s.post(f"{BASE}/payments/checkout", headers=H2, json={"lookup_key":"automa_monthly","origin_url":"https://x.com"}).json()
mc.payment_transactions.update_one({"session_id":r["session_id"]},{"$set":{"payment_status":"paid","status":"completed"}})
r = s.post(f"{BASE}/companies", headers=H2, json={"name":"Co2","cnpj":"22222222000191"})
assert r.status_code==200, r.text
clis = s.get(f"{BASE}/clients", headers=H2).json()["clients"]
assert clis==[], clis; ok("tenant isolation")

# 15. Upload/files
files = {"file": ("t.txt", b"hello world", "text/plain")}
r = s.post(f"{BASE}/upload", headers=H, files=files)
if r.status_code!=200:
    fail("upload", r.text)
else:
    f = r.json()["file"]
    r2 = s.get(f"{BASE}/files", params={"path":f["storage_path"],"token":token})
    if r2.status_code==200 and r2.content==b"hello world":
        ok("upload+files")
    else:
        fail("files download", f"{r2.status_code}:{r2.text[:200]}")

print("\n== SUMMARY ==")
print("Passed:", len(results["passed"]))
print("Failed:", len(results["failed"]))
for f in results["failed"]:
    print(" -", f)
sys.exit(0 if not results["failed"] else 1)
