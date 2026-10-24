import json, threading, http.server, socketserver, functools, os
from playwright.sync_api import sync_playwright
from mock_api import Mock
ROOT=os.path.join(os.path.dirname(__file__),"..")
def serve(port=8765):
    h=functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    class Q(h.func):
        def log_message(self,*a): pass
    socketserver.TCPServer.allow_reuse_address=True
    s=socketserver.TCPServer(("127.0.0.1",port),functools.partial(Q,directory=ROOT)); threading.Thread(target=s.serve_forever,daemon=True).start(); return s
def new_page(browser, mock, w=390, h=800, touch=True):
    ctx=browser.new_context(viewport={"width":w,"height":h}, has_touch=touch, is_mobile=touch and w<600)
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)))
    def route(r):
        req=r.request
        if req.method=="OPTIONS": return r.fulfill(status=204)
        try: body=json.loads(req.post_data or "{}"); data=mock.handle(body); out={"ok":True,"data":data}
        except Exception as e: out={"ok":False,"error":str(e)}
        r.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin":"*"}, body=json.dumps(out))
    ctx.route("https://script.google.com/**", route)
    ctx.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(status=200, body=""))
    ctx.route("https://fonts.gstatic.com/**", lambda r: r.abort())
    ctx.route("https://cdnjs.cloudflare.com/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=""))
    return ctx, pg, errs
