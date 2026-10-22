/* SHOPROCK hero: a gold 3D heart with orbiting ring and particles (three.js r128, loaded from cdnjs). */
(function () {
  const host = document.getElementById("scene"); if (!host) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fail = () => document.documentElement.classList.add("noscene");
  function build() {
    const T = window.THREE; if (!T) return fail();
    let renderer;
    try { renderer = new T.WebGLRenderer({antialias:true, alpha:true}); } catch (e) { return fail(); }
    const W = () => host.clientWidth || 800, H = () => host.clientHeight || 600;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(W(), H()); host.appendChild(renderer.domElement);
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(42, W()/H(), .1, 100); cam.position.set(0, 0, 10);
    // heart shape
    const s = new T.Shape(); s.moveTo(.5,.5); s.bezierCurveTo(.5,.5,.4,0,0,0); s.bezierCurveTo(-.6,0,-.6,.7,-.6,.7); s.bezierCurveTo(-.6,1.1,-.3,1.54,.5,1.9);
    s.bezierCurveTo(1.2,1.54,1.6,1.1,1.6,.7); s.bezierCurveTo(1.6,.7,1.6,0,1,0); s.bezierCurveTo(.7,0,.5,.5,.5,.5);
    const g = new T.ExtrudeGeometry(s, {depth:.45, bevelEnabled:true, bevelSegments:8, steps:2, bevelSize:.14, bevelThickness:.14, curveSegments:32}); g.center();
    const mat = new T.MeshStandardMaterial({color:0xd9b46a, metalness:.75, roughness:.28, emissive:0x2a1608, emissiveIntensity:.6});
    const heart = new T.Mesh(g, mat); heart.rotation.z = Math.PI; scene.add(heart);
    const ring = new T.Mesh(new T.TorusGeometry(1.9, .018, 12, 160), new T.MeshBasicMaterial({color:0xe4c98f, transparent:true, opacity:.8})); ring.rotation.x = 1.15; scene.add(ring);
    const ring2 = ring.clone(); ring2.scale.setScalar(1.35); ring2.rotation.set(.5, 0, .6); ring2.material = ring.material.clone(); ring2.material.opacity = .35; scene.add(ring2);
    // particles
    const N = 520, pos = new Float32Array(N*3);
    for (let i = 0; i < N; i++) { const r = 3.2 + Math.random()*6, a = Math.random()*Math.PI*2, b = Math.acos(2*Math.random()-1); pos[i*3] = r*Math.sin(b)*Math.cos(a); pos[i*3+1] = r*Math.sin(b)*Math.sin(a); pos[i*3+2] = r*Math.cos(b)-2; }
    const pg = new T.BufferGeometry(); pg.setAttribute("position", new T.BufferAttribute(pos, 3));
    const pts = new T.Points(pg, new T.PointsMaterial({color:0xe4c98f, size:.05, transparent:true, opacity:.75, depthWrite:false})); scene.add(pts);
    scene.add(new T.AmbientLight(0xffffff, .55));
    const key = new T.DirectionalLight(0xfff1d6, 1.6); key.position.set(4, 5, 6); scene.add(key);
    const rose = new T.PointLight(0xff7a9c, 2.2, 30); rose.position.set(-5, -2, 4); scene.add(rose);
    const gold = new T.PointLight(0xc8a76a, 2, 30); gold.position.set(5, -3, 3); scene.add(gold);
    let mx = 0, my = 0, tx = 0, ty = 0, vis = true, t0 = performance.now();
    addEventListener("pointermove", e => { mx = (e.clientX/innerWidth - .5); my = (e.clientY/innerHeight - .5); }, {passive:true});
    function layout() { const w = W(), mobile = w < 760; cam.aspect = w/H(); cam.updateProjectionMatrix(); renderer.setSize(w, H());
      const sc = mobile ? .82 : 1.25; heart.scale.setScalar(sc); ring.scale.setScalar(sc*.9); ring2.scale.setScalar(sc*1.2);
      const px = mobile ? 0 : 3.2, py = mobile ? 2.2 : 0; heart.position.set(px, py, 0); ring.position.copy(heart.position); ring2.position.copy(heart.position); }
    addEventListener("resize", layout); layout();
    function frame(now) {
      const t = (now - t0)/1000; tx += (mx - tx)*.05; ty += (my - ty)*.05;
      heart.rotation.y = t*.5 + tx*1.2; heart.rotation.x = ty*.6; heart.position.y += (Math.sin(t*1.2)*.12 - (heart.position.y - (W() < 760 ? 2.2 : 0)))*.02;
      ring.rotation.z = t*.25; ring2.rotation.y = t*.18; pts.rotation.y = t*.03 + tx*.2; pts.rotation.x = ty*.1;
      renderer.render(scene, cam);
    }
    if (reduce) { frame(performance.now()); return; }
    (function loop(now) { if (vis && !document.hidden) frame(now); requestAnimationFrame(loop); })(performance.now());
    if ("IntersectionObserver" in window) new IntersectionObserver(en => { vis = en[0].isIntersecting; }).observe(host);
  }
  if (window.THREE) return build();
  const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"; sc.onload = build; sc.onerror = fail; document.head.appendChild(sc);
})();
