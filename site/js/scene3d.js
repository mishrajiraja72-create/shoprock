/* SHOPROCK hero: a floating gold-ribboned gift box, glowing light inside, sparkles. three.js r128 */
(function () {
  const host = document.getElementById("scene"); if (!host) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fail = () => document.documentElement.classList.add("noscene");
  function build() {
    const T = window.THREE; if (!T) return fail();
    let r; try { r = new T.WebGLRenderer({antialias:true, alpha:true}); } catch (e) { return fail(); }
    const W = () => host.clientWidth || 800, H = () => host.clientHeight || 600;
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.setSize(W(), H()); r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.15; host.appendChild(r.domElement);
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(36, W()/H(), .1, 100); cam.position.set(0, 1.2, 11);
    // studio reflections: a tiny room of soft light panels -> real metal reflections
    const env = new T.Scene(), pm = new T.PMREMGenerator(r);
    [[0,8,0,14,.4,14,3],[-9,2,2,.4,8,8,2.2],[9,3,-2,.4,8,8,1.6],[0,1,-9,14,6,.4,1.2]].forEach(a => { const m = new T.Mesh(new T.BoxGeometry(a[3],a[4],a[5]), new T.MeshBasicMaterial({color:new T.Color(1,.9,.72).multiplyScalar(a[6])})); m.position.set(a[0],a[1],a[2]); env.add(m); });
    scene.environment = pm.fromScene(env, .04).texture;
    const gold = new T.MeshStandardMaterial({color:0xd8b25f, metalness:1, roughness:.22});
    const velvet = new T.MeshStandardMaterial({color:0x14100c, metalness:.55, roughness:.38});
    const box = new T.Group(), lid = new T.Group();
    const mk = (g, m, x=0, y=0, z=0) => { const o = new T.Mesh(g, m); o.position.set(x,y,z); return o; };
    box.add(mk(new T.BoxGeometry(2.6,2,2.6), velvet));
    box.add(mk(new T.BoxGeometry(.5,2.02,2.64), gold)); box.add(mk(new T.BoxGeometry(2.64,2.02,.5), gold));
    lid.add(mk(new T.BoxGeometry(2.9,.6,2.9), velvet));
    lid.add(mk(new T.BoxGeometry(.5,.62,2.94), gold)); lid.add(mk(new T.BoxGeometry(2.94,.62,.5), gold));
    [-1,1].forEach(s => { const l = mk(new T.TorusGeometry(.5,.13,16,48), gold, s*.55, .55, 0); l.scale.set(1,1.25,.7); l.rotation.set(0, s*.5, s*-.7); lid.add(l); });
    lid.add(mk(new T.SphereGeometry(.2,24,24), gold, 0, .5, 0));
    lid.position.y = 1.7; box.position.y = -.6; lid.userData.y = 1.7;
    const glow = mk(new T.CircleGeometry(1.15,48), new T.MeshBasicMaterial({color:0xffd98a, transparent:true, opacity:.9, blending:T.AdditiveBlending}), 0, 1.02, 0); glow.rotation.x = -Math.PI/2; box.add(glow);
    const beam = mk(new T.CylinderGeometry(1.1,.35,3.4,48,1,true), new T.MeshBasicMaterial({color:0xffc86a, transparent:true, opacity:.16, blending:T.AdditiveBlending, side:T.DoubleSide, depthWrite:false}), 0, 2.7, 0); box.add(beam);
    box.add(lid); const rig = new T.Group(); rig.add(box); scene.add(rig);
    const ring = mk(new T.TorusGeometry(3.3,.012,8,200), new T.MeshBasicMaterial({color:0xe4c98f, transparent:true, opacity:.55})); ring.rotation.x = 1.25; rig.add(ring);
    const N = 380, pos = new Float32Array(N*3), sp = [];
    for (let i = 0; i < N; i++) { pos[i*3] = (Math.random()-.5)*14; pos[i*3+1] = (Math.random()-.5)*9; pos[i*3+2] = (Math.random()-.5)*8-1; sp.push(.15+Math.random()*.5); }
    const pg = new T.BufferGeometry(); pg.setAttribute("position", new T.BufferAttribute(pos, 3));
    const pts = new T.Points(pg, new T.PointsMaterial({color:0xffe2a8, size:.06, transparent:true, opacity:.85, depthWrite:false, blending:T.AdditiveBlending})); scene.add(pts);
    scene.add(new T.AmbientLight(0xffffff, .25));
    const key = new T.DirectionalLight(0xfff0d0, 1.4); key.position.set(4,6,6); scene.add(key);
    const warm = new T.PointLight(0xffb868, 3, 14); warm.position.set(0, 2.2, 0); rig.add(warm);
    let mx = 0, my = 0, tx = 0, ty = 0, vis = true, sy = 0;
    addEventListener("pointermove", e => { mx = e.clientX/innerWidth - .5; my = e.clientY/innerHeight - .5; }, {passive:true});
    addEventListener("scroll", () => { sy = Math.min(1, scrollY/innerHeight); }, {passive:true});
    function layout() { const w = W(), mob = w < 760; cam.aspect = w/H(); cam.updateProjectionMatrix(); r.setSize(w, H()); rig.scale.setScalar(mob ? .62 : .95); rig.position.set(mob ? 0 : 3.4, mob ? 2.4 : .1, 0); }
    addEventListener("resize", layout); layout();
    function frame(now) {
      const t = now/1000; tx += (mx-tx)*.05; ty += (my-ty)*.05;
      rig.rotation.y = t*.35 + tx*1.4 + sy*2; rig.rotation.x = ty*.35 + .12; rig.position.y += ((innerWidth<760?2.4:.1) + Math.sin(t*1.1)*.18 - sy*1.2 - rig.position.y)*.06;
      lid.position.y = lid.userData.y + .25 + Math.sin(t*1.1)*.12 + sy*.9; lid.rotation.y = Math.sin(t*.6)*.12;
      beam.material.opacity = .13 + Math.sin(t*2)*.04 + sy*.1; warm.intensity = 3 + Math.sin(t*2)*.6 + sy*3; ring.rotation.z = t*.2;
      const a = pg.attributes.position; for (let i = 0; i < N; i++) { a.array[i*3+1] += sp[i]*.006; if (a.array[i*3+1] > 4.5) a.array[i*3+1] = -4.5; } a.needsUpdate = true; pts.rotation.y = tx*.2;
      r.render(scene, cam);
    }
    if (reduce) { frame(1000); return; }
    (function loop(now) { if (vis && !document.hidden) frame(now); requestAnimationFrame(loop); })(0);
    if ("IntersectionObserver" in window) new IntersectionObserver(en => { vis = en[0].isIntersecting; }).observe(host);
  }
  if (window.THREE) return build();
  const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"; sc.onload = build; sc.onerror = fail; document.head.appendChild(sc);
})();
