"""MOCK of the Apps Script API, used ONLY by browser tests (intercepts script.google.com).
It is NOT the real backend; results prove storefront behaviour against the documented API contract only."""
import json, uuid
IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23b9a3e3'/%3E%3C/svg%3E"
PRODUCTS = [
 dict(product_id="P1", name="Couple Name Lamp", price=1299, category="Lamps", image_url=IMG, gallery=[IMG, IMG], description="A glowing lamp.", available=True, highlights=["Warm light"], long_description=["Made for late-night talks."], delivery_estimate="5-7 days"),
 dict(product_id="P2", name="Love Letter Box", price=499, category="Keepsakes", image_url=IMG, gallery=[], description="A box of notes.", available=True),
 dict(product_id="P3", name="Rose Bouquet", price=799, category="Flowers", image_url=IMG, gallery=[], description="Everlasting roses.", available=True),
]
class Mock:
    def __init__(self): self.orders={}; self.idem={}; self.calls=[]
    def handle(self, body):
        a=body.get("action"); self.calls.append(a)
        if a=="public.config": return dict(store_name="SHOPROCK", whatsapp_number="919876543210", free_shipping_above=999, checkout_mode="MANUAL", site={"addons":{"items":[{"id":"P2","on":True}]}}, support_email="help@example.com")
        if a=="public.products": return PRODUCTS
        if a=="public.product": return next(p for p in PRODUCTS if p["product_id"]==body["product_id"])
        if a=="public.reviews": return dict(count=0, avg=0, reviews=[])
        if a=="public.content": return dict(policy_shipping="Ships in 5-7 days.", policy_returns="See returns.", policy_privacy="Privacy.", policy_terms="Terms.")
        if a=="public.coupon": raise Exception("Invalid coupon")
        if a=="public.createOrder":
            k=body["idempotency_key"]
            if k in self.idem: return self.idem[k]
            oid="ORD-"+uuid.uuid4().hex[:8].upper()
            total=sum(next(p for p in PRODUCTS if p["product_id"]==i["product_id"])["price"]*i["qty"] for i in body["items"])
            r=dict(order_id=oid, total=total, mode="MANUAL", upi_id="shop@upi", note="Order placed.", payment_instructions="Pay via UPI.", whatsapp_number="919876543210")
            self.orders[oid]=dict(body=body, total=total); self.idem[k]=r; return r
        if a=="public.trackOrder":
            o=self.orders.get(body["order_id"])
            if not o or not o["body"]["phone"].endswith(body["phone_last4"]): raise Exception("Order not found")
            return dict(order_id=body["order_id"], payment_status="UNPAID", order_status="PLACED", total=o["total"], items=[dict(name="Item", qty=i["qty"], product_id=i["product_id"]) for i in o["body"]["items"]])
        raise Exception("Unknown action "+str(a))
