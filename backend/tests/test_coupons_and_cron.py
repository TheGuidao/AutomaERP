"""
AutomaERP - Iteration 2 backend tests
Focus: Coupons (validate + admin CRUD), Checkout with coupon, Cron reminders,
plus quick smoke of pre-existing flow.
"""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient

# Load backend .env for MONGO_URL / DB_NAME / WEBHOOK_CRON_SECRET
load_dotenv(Path("/app/backend/.env"))

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if "REACT_APP_BACKEND_URL" in os.environ else None
if not BASE_URL:
    # frontend .env
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = BASE_URL + "/api"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
WEBHOOK_CRON_SECRET = os.environ["WEBHOOK_CRON_SECRET"]

ADMIN_EMAIL = "guibitt85@gmail.com"
ADMIN_PW = "Test1234!"
NONADMIN_EMAIL = f"nonadmin_{uuid.uuid4().hex[:6]}@teste.com"
NONADMIN_PW = "Test1234!"

_mongo = MongoClient(MONGO_URL)
mdb = _mongo[DB_NAME]


# ---------- Session-scoped fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    """Login admin (register if missing)."""
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    if r.status_code != 200:
        r = requests.post(f"{API}/auth/register", json={"email": ADMIN_EMAIL, "password": ADMIN_PW, "name": "Guilherme Admin"})
        assert r.status_code == 200, f"admin register failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def nonadmin_token():
    r = requests.post(f"{API}/auth/register", json={"email": NONADMIN_EMAIL, "password": NONADMIN_PW, "name": "Non Admin"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_coupons():
    """Cleanup coupons created by tests."""
    yield
    mdb.coupons.delete_many({"code": {"$in": ["WELCOME", "BLACK50", "ONESHOT"]}})


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# =====================================================
# 1) auth/me is_platform_admin
# =====================================================
class TestPlatformAdminFlag:
    def test_admin_user_flag_true(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=_h(admin_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["is_platform_admin"] is True

    def test_nonadmin_user_flag_false(self, nonadmin_token):
        r = requests.get(f"{API}/auth/me", headers=_h(nonadmin_token))
        assert r.status_code == 200, r.text
        assert r.json()["is_platform_admin"] is False


# =====================================================
# 2) Admin Coupon CRUD auth
# =====================================================
class TestAdminCouponAuth:
    def test_list_without_auth_401(self):
        r = requests.get(f"{API}/admin/coupons")
        assert r.status_code == 401

    def test_list_as_nonadmin_403(self, nonadmin_token):
        r = requests.get(f"{API}/admin/coupons", headers=_h(nonadmin_token))
        assert r.status_code == 403

    def test_create_without_auth_401(self):
        r = requests.post(f"{API}/admin/coupons", json={"code": "X", "percent_off": 10})
        assert r.status_code == 401

    def test_create_as_nonadmin_403(self, nonadmin_token):
        r = requests.post(f"{API}/admin/coupons", headers=_h(nonadmin_token),
                          json={"code": "X", "percent_off": 10})
        assert r.status_code == 403


# =====================================================
# 3) Admin Coupon CRUD as admin - happy path + validation
# =====================================================
class TestAdminCouponCRUD:
    def test_a_cleanup_and_create_welcome(self, admin_token):
        # Ensure clean state
        mdb.coupons.delete_many({"code": "WELCOME"})
        payload = {"code": "WELCOME", "percent_off": 100, "active": True, "max_uses": 10}
        r = requests.post(f"{API}/admin/coupons", headers=_h(admin_token), json=payload)
        assert r.status_code == 200, r.text
        c = r.json()["coupon"]
        assert c["code"] == "WELCOME"
        assert c["percent_off"] == 100
        assert c["max_uses"] == 10
        assert c["active"] is True
        # persisted?
        got = mdb.coupons.find_one({"code": "WELCOME"})
        assert got is not None

    def test_b_list_contains_welcome(self, admin_token):
        r = requests.get(f"{API}/admin/coupons", headers=_h(admin_token))
        assert r.status_code == 200
        codes = [c["code"] for c in r.json()["coupons"]]
        assert "WELCOME" in codes

    def test_c_duplicate_code_400(self, admin_token):
        r = requests.post(f"{API}/admin/coupons", headers=_h(admin_token),
                          json={"code": "WELCOME", "percent_off": 20})
        assert r.status_code == 400

    def test_d_missing_discount_400(self, admin_token):
        r = requests.post(f"{API}/admin/coupons", headers=_h(admin_token),
                          json={"code": f"NODISC_{uuid.uuid4().hex[:4]}"})
        assert r.status_code == 400

    def test_e_percent_out_of_range_400(self, admin_token):
        r = requests.post(f"{API}/admin/coupons", headers=_h(admin_token),
                          json={"code": f"BAD_{uuid.uuid4().hex[:4]}", "percent_off": 101})
        assert r.status_code == 400
        r2 = requests.post(f"{API}/admin/coupons", headers=_h(admin_token),
                           json={"code": f"BAD_{uuid.uuid4().hex[:4]}", "percent_off": 0})
        assert r2.status_code == 400

    def test_f_update_welcome(self, admin_token):
        r = requests.put(f"{API}/admin/coupons/WELCOME", headers=_h(admin_token),
                         json={"code": "WELCOME", "percent_off": 100, "active": True, "max_uses": 5,
                               "description": "Boas-vindas"})
        assert r.status_code == 200
        assert r.json()["coupon"]["max_uses"] == 5
        assert r.json()["coupon"]["description"] == "Boas-vindas"

    def test_g_delete_creates_temp_and_removes(self, admin_token):
        tmp = f"TMP_{uuid.uuid4().hex[:6].upper()}"
        r = requests.post(f"{API}/admin/coupons", headers=_h(admin_token),
                          json={"code": tmp, "percent_off": 10})
        assert r.status_code == 200
        d = requests.delete(f"{API}/admin/coupons/{tmp}", headers=_h(admin_token))
        assert d.status_code == 200
        assert mdb.coupons.find_one({"code": tmp}) is None


# =====================================================
# 4) Public /coupons/validate
# =====================================================
class TestCouponValidate:
    def test_valid_welcome_100pct(self, admin_token):
        # rely on WELCOME (may have been decremented in previous tests via update to max_uses=5)
        # ensure fresh WELCOME with plenty of uses
        mdb.coupons.update_one({"code": "WELCOME"},
                               {"$set": {"percent_off": 100, "amount_off": None, "active": True,
                                         "max_uses": 10, "uses": 0}})
        r = requests.post(f"{API}/coupons/validate",
                          json={"code": "WELCOME", "lookup_key": "automa_monthly"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["valid"] is True
        assert d["discount"] == 10000
        assert d["final_amount"] == 0
        assert d["base_amount"] == 10000

    def test_invalid_code(self):
        r = requests.post(f"{API}/coupons/validate",
                          json={"code": "NOPE_XYZ_NEVER", "lookup_key": "automa_monthly"})
        assert r.status_code == 200
        d = r.json()
        assert d["valid"] is False
        assert "inválido" in d.get("error", "").lower() or "invalido" in d.get("error", "").lower()

    def test_empty_code_valid_no_discount(self):
        r = requests.post(f"{API}/coupons/validate",
                          json={"code": "", "lookup_key": "automa_monthly"})
        assert r.status_code == 200
        d = r.json()
        assert d["valid"] is True
        assert d["discount"] == 0
        assert d["final_amount"] == d["base_amount"] == 10000

    def test_invalid_plan_400(self):
        r = requests.post(f"{API}/coupons/validate",
                          json={"code": "WELCOME", "lookup_key": "unknown_plan"})
        assert r.status_code == 400


# =====================================================
# 5) Checkout with coupon (free & 50% off)
# =====================================================
class TestCheckoutWithCoupon:
    def test_a_invalid_coupon_400(self, nonadmin_token):
        r = requests.post(f"{API}/payments/checkout", headers=_h(nonadmin_token),
                          json={"lookup_key": "automa_monthly",
                                "origin_url": "https://example.com",
                                "coupon_code": "DOES_NOT_EXIST"})
        assert r.status_code == 400

    def test_b_welcome_100pct_free_session(self, nonadmin_token):
        # Reset WELCOME uses so we can consume it
        mdb.coupons.update_one({"code": "WELCOME"},
                               {"$set": {"uses": 0, "max_uses": 10, "percent_off": 100, "active": True}})
        r = requests.post(f"{API}/payments/checkout", headers=_h(nonadmin_token),
                          json={"lookup_key": "automa_monthly",
                                "origin_url": "https://example.com",
                                "coupon_code": "WELCOME"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["session_id"].startswith("free_")
        assert "/payment/success?session_id=" in d["checkout_url"]
        assert d.get("free") is True

        # DB assertions
        txn = mdb.payment_transactions.find_one({"session_id": d["session_id"]})
        assert txn is not None
        assert txn["payment_status"] == "paid"
        assert txn["amount"] == 0
        assert txn["discount"] == 10000

        # Coupon uses incremented
        c = mdb.coupons.find_one({"code": "WELCOME"})
        assert c["uses"] == 1

        # GET /payments/status confirms paid
        s = requests.get(f"{API}/payments/status/{d['session_id']}")
        assert s.status_code == 200
        assert s.json()["payment_status"] == "paid"

        # Now POST /companies works (consumes the free txn)
        cnpj = f"00.000.000/{uuid.uuid4().hex[:4]}-99"
        c_r = requests.post(f"{API}/companies", headers=_h(nonadmin_token),
                            json={"name": "FreeCo", "cnpj": cnpj})
        assert c_r.status_code == 200, c_r.text
        # txn now consumed
        txn2 = mdb.payment_transactions.find_one({"session_id": d["session_id"]})
        assert txn2.get("consumed") is True

    def test_c_black50_stripe_session_with_discount(self, admin_token):
        # Create BLACK50 as admin
        mdb.coupons.delete_many({"code": "BLACK50"})
        rc = requests.post(f"{API}/admin/coupons", headers=_h(admin_token),
                           json={"code": "BLACK50", "percent_off": 50, "active": True})
        assert rc.status_code == 200

        # Register a fresh user (non-admin) for stripe checkout
        email = f"stripe_{uuid.uuid4().hex[:6]}@t.com"
        rr = requests.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "name": "S"})
        tok = rr.json()["token"]
        r = requests.post(f"{API}/payments/checkout", headers=_h(tok),
                          json={"lookup_key": "automa_monthly",
                                "origin_url": "https://example.com",
                                "coupon_code": "BLACK50"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["session_id"].startswith("cs_")  # Stripe real session id
        assert "stripe" in d["checkout_url"].lower() or d["checkout_url"].startswith("https://checkout.stripe.com")
        txn = mdb.payment_transactions.find_one({"session_id": d["session_id"]})
        assert txn is not None
        assert txn["amount"] == 5000  # 50% off 10000
        assert txn["discount"] == 5000
        assert txn["payment_status"] == "pending"
        c = mdb.coupons.find_one({"code": "BLACK50"})
        assert c["uses"] == 1

    def test_d_max_uses_exhausted(self, admin_token):
        # Create ONESHOT with max_uses=1
        mdb.coupons.delete_many({"code": "ONESHOT"})
        rc = requests.post(f"{API}/admin/coupons", headers=_h(admin_token),
                           json={"code": "ONESHOT", "percent_off": 100, "max_uses": 1, "active": True})
        assert rc.status_code == 200

        email = f"once_{uuid.uuid4().hex[:6]}@t.com"
        rr = requests.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "name": "O"})
        tok = rr.json()["token"]
        r1 = requests.post(f"{API}/payments/checkout", headers=_h(tok),
                           json={"lookup_key": "automa_monthly",
                                 "origin_url": "https://example.com",
                                 "coupon_code": "ONESHOT"})
        assert r1.status_code == 200, r1.text
        # 2nd attempt should fail
        r2 = requests.post(f"{API}/payments/checkout", headers=_h(tok),
                           json={"lookup_key": "automa_monthly",
                                 "origin_url": "https://example.com",
                                 "coupon_code": "ONESHOT"})
        assert r2.status_code == 400
        assert "esgot" in r2.text.lower()


# =====================================================
# 6) Cron endpoint auth + effect
# =====================================================
class TestCron:
    def test_a_no_auth_401(self):
        r = requests.post(f"{API}/cron/subscription-reminders")
        assert r.status_code == 401

    def test_b_wrong_auth_401(self):
        r = requests.post(f"{API}/cron/subscription-reminders",
                          headers={"Authorization": "Bearer wrong-secret"})
        assert r.status_code == 401

    def test_c_correct_auth_queued(self):
        r = requests.post(f"{API}/cron/subscription-reminders",
                          headers={"Authorization": f"Bearer {WEBHOOK_CRON_SECRET}"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "queued"

    def test_d_reminder_dedup_and_effect(self):
        # Setup: create a fresh CEO + company expiring in ~3 days
        email = f"reminder_{uuid.uuid4().hex[:6]}@t.com"
        rr = requests.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "name": "Rem"})
        assert rr.status_code == 200
        tok = rr.json()["token"]
        user_id = rr.json()["user"]["id"]

        # Inject a paid txn directly in mongo (avoid Stripe)
        session_id = f"free_manual_{uuid.uuid4().hex}"
        mdb.payment_transactions.insert_one({
            "session_id": session_id, "user_id": user_id, "lookup_key": "automa_monthly",
            "amount": 0, "currency": "brl",
            "status": "completed", "payment_status": "paid", "consumed": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        cnpj = f"99.999.999/{uuid.uuid4().hex[:4]}-11"
        cc = requests.post(f"{API}/companies", headers=_h(tok),
                           json={"name": "RemCo", "cnpj": cnpj})
        assert cc.status_code == 200, cc.text
        company_id = cc.json()["company"]["id"]

        # Force subscription_expires_at ~ now + 3 days 12 hours (so days-delta = 3)
        target_exp = datetime.now(timezone.utc) + timedelta(days=3, hours=12)
        mdb.companies.update_one({"id": company_id},
                                 {"$set": {"subscription_expires_at": target_exp.isoformat()}})

        # Clear any pre-existing email_log for this company
        mdb.email_log.delete_many({"key": {"$regex": f"^{company_id}:"}})

        # Trigger cron
        r = requests.post(f"{API}/cron/subscription-reminders",
                          headers={"Authorization": f"Bearer {WEBHOOK_CRON_SECRET}"})
        assert r.status_code == 200
        time.sleep(3)

        logs = list(mdb.email_log.find({"key": {"$regex": f"^{company_id}:"}}))
        assert len(logs) == 1, f"expected 1 email_log entry, got {len(logs)}: {logs}"
        assert ":3" in logs[0]["key"], f"key should contain window=3, got {logs[0]['key']}"

        # Call cron again - dedup: still 1 entry
        r2 = requests.post(f"{API}/cron/subscription-reminders",
                           headers={"Authorization": f"Bearer {WEBHOOK_CRON_SECRET}"})
        assert r2.status_code == 200
        time.sleep(3)
        logs2 = list(mdb.email_log.find({"key": {"$regex": f"^{company_id}:"}}))
        assert len(logs2) == 1, f"dedup failed: got {len(logs2)} entries"


# =====================================================
# 7) Regression smoke: register/login/checkout(no coupon)/company/clients CRUD
# =====================================================
class TestRegressionSmoke:
    def test_full_flow(self):
        email = f"reg_{uuid.uuid4().hex[:6]}@t.com"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!", "name": "Reg"})
        assert r.status_code == 200
        tok = r.json()["token"]
        # login
        rl = requests.post(f"{API}/auth/login", json={"email": email, "password": "Test1234!"})
        assert rl.status_code == 200

        # checkout without coupon -> Stripe session pending
        rc = requests.post(f"{API}/payments/checkout", headers=_h(tok),
                           json={"lookup_key": "automa_monthly", "origin_url": "https://example.com"})
        assert rc.status_code == 200
        sid = rc.json()["session_id"]
        assert sid.startswith("cs_")

        # Simulate paid via mongo
        mdb.payment_transactions.update_one({"session_id": sid},
                                            {"$set": {"payment_status": "paid", "status": "completed"}})

        # create company
        cnpj = f"11.111.111/{uuid.uuid4().hex[:4]}-22"
        cc = requests.post(f"{API}/companies", headers=_h(tok),
                           json={"name": "RegCo", "cnpj": cnpj})
        assert cc.status_code == 200, cc.text

        # clients CRUD
        cl = requests.post(f"{API}/clients", headers=_h(tok),
                           json={"name": "Cliente 1", "address": "Rua X"})
        assert cl.status_code == 200
        cid = cl.json()["client"]["id"]
        lg = requests.get(f"{API}/clients", headers=_h(tok))
        assert lg.status_code == 200
        assert any(c["id"] == cid for c in lg.json()["clients"])
