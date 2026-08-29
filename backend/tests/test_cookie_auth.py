"""
AutomaERP - Iteration 3 backend tests
Focus: Cookie-based auth migration (httpOnly Secure SameSite=Lax) + backward compat with Bearer.
Also validates /files no longer accepts ?token= query, requires cookie or Bearer, and enforces path scoping.
Plus quick smoke of CRUD (clients, products, orders) via BOTH cookie and Bearer sessions.
"""
import os
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path("/app/backend/.env"))

BASE_URL = None
for line in Path("/app/frontend/.env").read_text().splitlines():
    if line.startswith("REACT_APP_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = BASE_URL + "/api"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
APP_NAME = os.environ.get("APP_NAME", "automa-erp")

_mongo = MongoClient(MONGO_URL)
mdb = _mongo[DB_NAME]

ADMIN_EMAIL = "guibitt85@gmail.com"
ADMIN_PW = "Test1234!"


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# =====================================================
# 1) Cookie is set on login and register
# =====================================================
class TestCookieSetOnAuth:
    def test_login_sets_cookie(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        assert r.status_code == 200, r.text
        # Cookie present in session jar
        assert "automa_token" in s.cookies.get_dict(), f"cookies={s.cookies.get_dict()}"
        # Response body still returns token+user (backward compat)
        body = r.json()
        assert "token" in body and body["token"]
        assert body["user"]["email"] == ADMIN_EMAIL
        # Set-Cookie header attributes
        set_cookie = r.headers.get("set-cookie", "")
        assert "automa_token=" in set_cookie
        low = set_cookie.lower()
        # Isolate our cookie's segment (comma-splits are unsafe due to expires=; parse by name)
        our = [seg for seg in set_cookie.split(",") if "automa_token=" in seg.lower()]
        assert our, f"automa_token not in Set-Cookie: {set_cookie}"
        seg = our[0].lower()
        assert "httponly" in seg
        assert "secure" in seg
        # Backend code sets SameSite=Lax; preview ingress may rewrite to None+Partitioned for iframe.
        assert ("samesite=lax" in seg) or ("samesite=none" in seg), seg
        assert "max-age=604800" in seg
        assert "path=/" in seg

    def test_register_sets_cookie(self):
        s = requests.Session()
        email = f"cookiereg_{uuid.uuid4().hex[:6]}@t.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "name": "CookieReg"})
        assert r.status_code == 200, r.text
        assert "automa_token" in s.cookies.get_dict()
        assert r.json()["user"]["email"] == email
        set_cookie = r.headers.get("set-cookie", "")
        our = [seg for seg in set_cookie.split(",") if "automa_token=" in seg.lower()]
        assert our, set_cookie
        seg = our[0].lower()
        assert "httponly" in seg and "secure" in seg
        assert ("samesite=lax" in seg) or ("samesite=none" in seg)


# =====================================================
# 2) /auth/me with cookie-only, bearer-only, both, none
# =====================================================
class TestAuthMeCookieAndBearer:
    def test_a_no_auth_returns_401(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_b_cookie_only_returns_200(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        assert r.status_code == 200
        # Same session (has cookie), no Authorization header
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200, me.text
        assert me.json()["user"]["email"] == ADMIN_EMAIL

    def test_c_bearer_only_returns_200(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        token = r.json()["token"]
        # Fresh session (no cookies); bearer only
        me = requests.get(f"{API}/auth/me", headers=_h(token))
        assert me.status_code == 200, me.text
        assert me.json()["user"]["email"] == ADMIN_EMAIL

    def test_d_bad_cookie_returns_401(self):
        r = requests.get(f"{API}/auth/me", cookies={"automa_token": "not-a-valid-jwt"})
        assert r.status_code == 401

    def test_e_bad_bearer_returns_401(self):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer not-a-valid-jwt"})
        assert r.status_code == 401


# =====================================================
# 3) Logout clears cookie
# =====================================================
class TestLogout:
    def test_logout_clears_cookie_and_me_becomes_401(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        assert r.status_code == 200
        assert "automa_token" in s.cookies.get_dict()

        out = s.post(f"{API}/auth/logout")
        assert out.status_code == 200
        # Set-Cookie clearing header should have Max-Age=0 OR an expires in the past
        sc = out.headers.get("set-cookie", "").lower()
        assert "automa_token=" in sc
        assert ("max-age=0" in sc) or ("expires=" in sc)
        # Requests session should have removed/cleared the cookie
        # (some servers set empty value with Max-Age=0; requests may drop it)
        # Either way, /auth/me should now be 401
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 401


# =====================================================
# 4) /files no longer accepts token query; requires cookie or Bearer
# =====================================================
class TestFilesAuth:
    def test_a_no_auth_401(self):
        r = requests.get(f"{API}/files", params={"path": f"{APP_NAME}/uploads/xxx/y.png"})
        assert r.status_code == 401

    def test_b_token_query_no_longer_works(self):
        # Old style with ?token=... should be rejected (no cookie/no bearer -> 401)
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        tok = r.json()["token"]
        r = requests.get(f"{API}/files", params={"path": f"{APP_NAME}/uploads/xxx/y.png", "token": tok})
        assert r.status_code == 401, f"token via query should NOT authenticate; got {r.status_code}"

    def test_c_auth_but_path_outside_appname_403(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        r = s.get(f"{API}/files", params={"path": "some-other-bucket/foo/bar.png"})
        assert r.status_code == 403

    def test_d_auth_but_wrong_company_id_in_path_403(self):
        # Admin has (or previously had) a company; craft path with a random company id
        s = requests.Session()
        lr = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        assert lr.status_code == 200
        me = s.get(f"{API}/auth/me").json()
        # If user has company_id, path with a different company id must 403
        if me["user"].get("company_id"):
            other = uuid.uuid4().hex
            r = s.get(f"{API}/files", params={"path": f"{APP_NAME}/uploads/{other}/x.png"})
            assert r.status_code == 403
        else:
            pytest.skip("admin has no company_id; skipping wrong-company path check")

    def test_e_auth_via_bearer_also_enforces_scope(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        tok = r.json()["token"]
        # No cookie, Bearer only. Path outside APP_NAME -> 403 (still authenticated)
        r = requests.get(f"{API}/files", headers=_h(tok),
                         params={"path": "not-app-name/foo/bar.png"})
        assert r.status_code == 403


# =====================================================
# 5) Regression smoke - CRUD with BOTH cookie and Bearer (backward compat)
# =====================================================
class TestRegressionSmokeBothAuth:
    """Register a fresh CEO + fake paid txn + company; then run CRUD via cookie and Bearer."""

    @pytest.fixture(scope="class")
    def setup_ceo(self):
        from datetime import datetime, timezone
        email = f"iter3_{uuid.uuid4().hex[:6]}@t.com"
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "name": "Iter3"})
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        user_id = r.json()["user"]["id"]

        # Inject a paid free txn
        session_id = f"free_iter3_{uuid.uuid4().hex}"
        mdb.payment_transactions.insert_one({
            "session_id": session_id, "user_id": user_id, "lookup_key": "automa_monthly",
            "amount": 0, "currency": "brl",
            "status": "completed", "payment_status": "paid", "consumed": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        # Create company (uses cookie in session s)
        cnpj = f"33.333.333/{uuid.uuid4().hex[:4]}-44"
        cc = s.post(f"{API}/companies", json={"name": "Iter3Co", "cnpj": cnpj})
        assert cc.status_code == 200, cc.text
        return {"email": email, "token": token, "session": s, "user_id": user_id,
                "company_id": cc.json()["company"]["id"]}

    def test_a_clients_via_cookie(self, setup_ceo):
        s = setup_ceo["session"]
        cr = s.post(f"{API}/clients", json={"name": "Cliente Cookie", "address": "Rua Cookie"})
        assert cr.status_code == 200, cr.text
        cid = cr.json()["client"]["id"]
        lg = s.get(f"{API}/clients")
        assert lg.status_code == 200
        assert any(c["id"] == cid for c in lg.json()["clients"])

    def test_b_clients_via_bearer(self, setup_ceo):
        tok = setup_ceo["token"]
        cr = requests.post(f"{API}/clients", headers=_h(tok),
                           json={"name": "Cliente Bearer", "address": "Rua Bearer"})
        assert cr.status_code == 200, cr.text
        cid = cr.json()["client"]["id"]
        lg = requests.get(f"{API}/clients", headers=_h(tok))
        assert lg.status_code == 200
        assert any(c["id"] == cid for c in lg.json()["clients"])

    def test_c_products_via_cookie_and_bearer(self, setup_ceo):
        s = setup_ceo["session"]
        # Create category first (products need category_id? check body)
        cat = s.post(f"{API}/categories", json={"name": "CatIter3"})
        assert cat.status_code == 200, cat.text
        cat_id = cat.json()["category"]["id"]

        pr = s.post(f"{API}/products", json={
            "name": "Prod Cookie", "sku": f"SKU_{uuid.uuid4().hex[:4]}",
            "price": 10.0, "cost": 5.0, "stock": 10, "category_id": cat_id
        })
        assert pr.status_code == 200, pr.text

        tok = setup_ceo["token"]
        pr2 = requests.post(f"{API}/products", headers=_h(tok), json={
            "name": "Prod Bearer", "sku": f"SKU_{uuid.uuid4().hex[:4]}",
            "price": 20.0, "cost": 10.0, "stock": 5, "category_id": cat_id
        })
        assert pr2.status_code == 200, pr2.text

        # List via both
        lc = s.get(f"{API}/products")
        assert lc.status_code == 200
        lb = requests.get(f"{API}/products", headers=_h(tok))
        assert lb.status_code == 200
        names_c = [p["name"] for p in lc.json()["products"]]
        names_b = [p["name"] for p in lb.json()["products"]]
        assert "Prod Cookie" in names_c and "Prod Bearer" in names_c
        assert names_c == names_b or set(names_c) == set(names_b)

    def test_d_orders_via_cookie(self, setup_ceo):
        s = setup_ceo["session"]
        # Need a client for the order
        cr = s.post(f"{API}/clients", json={"name": "OS Cliente", "address": "Rua OS"})
        assert cr.status_code == 200
        client_id = cr.json()["client"]["id"]

        from datetime import datetime, timezone, timedelta
        sd = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
        os_r = s.post(f"{API}/orders", json={
            "client_id": client_id,
            "title": "OS Cookie",
            "description": "Ordem via cookie",
            "items": [],
            "status": "aberta",
            "scheduled_date": sd,
            "start_time": "09:00",
            "end_time": "10:00",
        })
        assert os_r.status_code == 200, os_r.text
        oid = os_r.json()["order"]["id"]

        # Fetch via bearer (cross-auth)
        tok = setup_ceo["token"]
        g = requests.get(f"{API}/orders/{oid}", headers=_h(tok))
        assert g.status_code == 200
        assert g.json()["order"]["id"] == oid
