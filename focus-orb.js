/* FOCUS — энергетическая сфера ассистента (Canvas-движок)
   Использование: FocusOrb.mount(canvasElement)  — движок сам читает размер и тему.
   Тема берётся из CSS-переменных --accent-rgb / --accent-2-rgb активной data-theme.
   Работает на всех экранах: компактный вид, чат, приветствие. */
(function(){
  'use strict';

  // Палитры под каждую тему: [ближний, средний, дальний] в формате [r,g,b]
  var THEME_PALETTES = {
    original: [[93,224,255],[200,170,255],[255,107,213]],   // голубой → фиолет → розовый
    tron:     [[0,229,255],[120,200,255],[255,59,46]],       // циан → голубой → красный
    predator: [[57,255,106],[180,255,120],[255,122,26]],     // зелёный → салат → оранж
    mk:       [[255,215,0],[255,140,80],[255,26,46]],         // золото → оранж → красный
    matrix:   [[0,255,65],[120,255,140],[57,255,106]]         // зелёный спектр
  };

  function readTheme(){
    var th = document.documentElement.getAttribute('data-theme') || 'original';
    return THEME_PALETTES[th] ? th : 'original';
  }

  function lerp(a,b,t){ return a + (b-a)*t; }

  function makeColorFn(pal){
    // pal: [c0,c1,c2] — плавный переход c0→c1→c2 по h∈[0,1]
    return function(h,a){
      var c0,c1,t;
      if(h<0.5){ c0=pal[0]; c1=pal[1]; t=h/0.5; }
      else { c0=pal[1]; c1=pal[2]; t=(h-0.5)/0.5; }
      return 'rgba('+Math.round(lerp(c0[0],c1[0],t))+','+Math.round(lerp(c0[1],c1[1],t))+','+Math.round(lerp(c0[2],c1[2],t))+','+a+')';
    };
  }

  function mount(canvas){
    if(!canvas || canvas._orbMounted) return;
    canvas._orbMounted = true;
    var ctx = canvas.getContext('2d');

    // рендер в 2x для чёткости
    var cssW = canvas.clientWidth || parseInt(canvas.getAttribute('width'),10) || 120;
    var cssH = canvas.clientHeight || parseInt(canvas.getAttribute('height'),10) || 120;
    var DPR = 2;
    canvas.width = cssW*DPR;
    canvas.height = cssH*DPR;
    var W=canvas.width, H=canvas.height, CX=W/2, CY=H/2;
    var R = Math.min(W,H)/2 - Math.min(W,H)*0.06;

    // масштаб деталей от размера (маленькая иконка — меньше частиц)
    var small = cssW < 90;
    var rings = small ? 8 : 11;
    var partCount = small ? 60 : 160;
    var lineNear = small ? 0.5 : 0.42;

    var pal = makeColorFn(THEME_PALETTES[readTheme()]);
    var gridRGB, coreRGB;
    function refreshTheme(){
      var p = THEME_PALETTES[readTheme()];
      pal = makeColorFn(p);
      gridRGB = p[0];               // сетка — ближний цвет
      coreRGB = p[1];               // свечение ядра — средний
    }
    refreshTheme();

    // геодезические узлы
    var nodes=[];
    for(var i=0;i<=rings;i++){
      var lat=Math.PI*(i/rings)-Math.PI/2;
      var cnt=Math.max(1,Math.round(Math.cos(lat)*(small?14:20)));
      for(var j=0;j<cnt;j++) nodes.push({lat:lat,lon:2*Math.PI*(j/cnt),ph:Math.random()*6.28});
    }

    function newPart(init){
      return { a:Math.random()*6.28, rad:init?(R*0.12+Math.random()*R*0.62):(R*0.62+Math.random()*R*0.16),
        sp:0.006+Math.random()*0.022, sz:(small?0.6:0.8)+Math.random()*(small?1.8:2.6), hue:Math.random(),
        pull:(R*0.001)+Math.random()*(R*0.002), ell:0.7+Math.random()*0.25, tw:Math.random()*6.28 };
    }
    var parts=[]; for(var k=0;k<partCount;k++) parts.push(newPart(true));
    var bolts=[];

    // ===== РЕЖИМ РОЖДЕНИЯ (тот же орб собирается по фазам) =====
    var birth = canvas.getAttribute('data-birth') === '1';
    var BIRTH_T = 3.6;            // длительность рождения в t-единицах (~7.5с)
    var birthT0 = null;
    if (birth) {
      // каждой частице — точка влёта с края холста (=края телефона)
      for (var bk=0; bk<parts.length; bk++){
        var edge=Math.floor(Math.random()*4), ex,ey;
        if(edge===0){ex=Math.random()*W;ey=-20;}else if(edge===1){ex=W+20;ey=Math.random()*H;}
        else if(edge===2){ex=Math.random()*W;ey=H+20;}else{ex=-20;ey=Math.random()*H;}
        parts[bk].bfx=ex; parts[bk].bfy=ey;
      }
    }
    // порядок раскрытия узлов (сверху вниз) для плетения сетки
    var revealOrder = nodes.map(function(n,ix){return ix;}).sort(function(a,b){return (nodes[a].lat-nodes[b].lat)||(nodes[a].lon-nodes[b].lon);});
    var weaveBolts=[];
    function segsB(x1,y1,x2,y2,disp,gen){ var out=[]; if(gen>5)gen=5;
      (function sub(ax,ay,bx2,by,d,g){ if(g<=0){out.push([ax,ay,bx2,by]);return;}
        var mx=(ax+bx2)/2,my=(ay+by)/2,nx=-(by-ay),ny=(bx2-ax),ln=Math.hypot(nx,ny)||1;nx/=ln;ny/=ln;
        var off=(Math.random()-0.5)*d;mx+=nx*off;my+=ny*off; sub(ax,ay,mx,my,d/2,g-1); sub(mx,my,bx2,by,d/2,g-1);
        if(g>2&&Math.random()<0.3){var ang=Math.atan2(by-ay,bx2-ax)+(Math.random()-0.5)*1.2,l2=Math.hypot(bx2-mx,by-my)*(0.4+Math.random()*0.35);sub(mx,my,mx+Math.cos(ang)*l2,my+Math.sin(ang)*l2,d/2,g-2);}
      })(x1,y1,x2,y2,disp,gen); return out; }
    function drawWeave(S,w,al){ ctx.globalCompositeOperation='lighter'; ctx.lineCap='round'; var L=[[w*3.5,0.14],[w*1.8,0.4],[w,0.95]];
      for(var l=0;l<3;l++){ctx.lineWidth=L[l][0];ctx.beginPath();for(var q=0;q<S.length;q++){ctx.moveTo(S[q][0],S[q][1]);ctx.lineTo(S[q][2],S[q][3]);}ctx.strokeStyle=l<2?'rgba(127,208,255,'+(L[l][1]*al)+')':'rgba(240,250,255,'+(L[l][1]*al)+')';ctx.stroke();}
      ctx.globalCompositeOperation='source-over'; }

    function proj(lat,lon,rot,rr){
      var _r = rr || R;
      var x=Math.cos(lat)*Math.cos(lon+rot), y=Math.sin(lat), z=Math.cos(lat)*Math.sin(lon+rot);
      return {x:CX+x*_r, y:CY+y*_r*0.98, z:z};
    }

    var t=0, raf=null, minR=R*0.1;
    function draw(){
      t+=0.016;
      ctx.clearRect(0,0,W,H);
      var rot=t*0.22;
      // === ПРОГРЕСС РОЖДЕНИЯ ===
      var bp = 1;
      if (birth){ if(birthT0===null) birthT0=t; bp = Math.min(1,(t-birthT0)/BIRTH_T); }
      var ez=function(x){return 1-Math.pow(1-Math.max(0,Math.min(1,x)),3);};
      var eio=function(x){x=Math.max(0,Math.min(1,x));return x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;};
      // фазы: ядро(0-0.22) → пыль влёт(0.12-0.55) → пробой(0.3-0.5) → сетка(0.38-0.85) → живой(0.82-1)
      var coreI = birth ? ez(bp/0.22) : 1;
      var dustFly = birth ? (bp-0.12)/0.43 : 1;          // 0..1 влёт пыли
      var dustAlive = !birth || bp>0.55;
      var revealN = birth ? (bp<0.38?0:Math.floor(eio((bp-0.38)/0.47)*nodes.length)) : nodes.length;
      var aliveA = birth ? Math.max(0,Math.min(1,(bp-0.82)/0.18)) : 1;

      var breathe = 1 + Math.sin(t*0.7)*0.06;
      var Rb = R * breathe;

      // фоновое свечение (по ядру)
      var bgI = Math.max(coreI, aliveA);
      var g=ctx.createRadialGradient(CX,CY,0,CX,CY,Rb+Rb*0.16);
      g.addColorStop(0,'rgba('+coreRGB[0]+','+coreRGB[1]+','+coreRGB[2]+','+(0.28*bgI)+')');
      g.addColorStop(0.4,'rgba('+gridRGB[0]+','+gridRGB[1]+','+gridRGB[2]+','+(0.12*bgI)+')');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(CX,CY,Rb+Rb*0.16,0,6.29);ctx.fill();

      var pc=[]; for(var i=0;i<nodes.length;i++) pc[i]=proj(nodes[i].lat,nodes[i].lon,rot,Rb);

      // СЕТКА (только раскрытые узлы)
      if(revealN>0){
        var revealed = birth ? new Array(nodes.length) : null;
        if(birth){ for(var rr=0;rr<revealN;rr++) revealed[revealOrder[rr]]=true; }
        ctx.lineWidth=1;
        for(var i=0;i<nodes.length;i++){
          if(birth && !revealed[i]) continue;
          var p=pc[i], depth=(p.z+1)/2;
          for(var j=i+1;j<nodes.length;j++){
            if(birth && !revealed[j]) continue;
            var dl=Math.abs(nodes[i].lat-nodes[j].lat), dg=Math.abs(nodes[i].lon-nodes[j].lon);
            if(dl<lineNear&&(dg<lineNear+0.02||dg>6.28-lineNear-0.02)){
              var p2=pc[j], d2=(p2.z+1)/2, al=(0.1+0.38*((depth+d2)/2))*Math.max(aliveA,0.85);
              ctx.strokeStyle='rgba('+gridRGB[0]+','+gridRGB[1]+','+gridRGB[2]+','+al+')';
              ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p2.x,p2.y);ctx.stroke();
            }
          }
        }
        // узлы + плетение молниями к свежим
        ctx.globalCompositeOperation='lighter';
        var upto = birth ? revealN : nodes.length;
        for(var r2=0;r2<upto;r2++){
          var ni = birth ? revealOrder[r2] : r2, p=pc[ni], depth=(p.z+1)/2, tw=0.6+0.4*Math.sin(t*3+nodes[ni].ph);
          var fresh = birth && r2>revealN-5 ? (1-(revealN-r2)/5) : 0;
          ctx.fillStyle='rgba('+Math.min(255,gridRGB[0]+80)+','+Math.min(255,gridRGB[1]+40)+','+Math.min(255,gridRGB[2]+40)+','+Math.min(1,(0.25+0.65*depth)*tw+fresh*0.8)+')';
          ctx.beginPath();ctx.arc(p.x,p.y,((1.2+2.2*depth)*(W/600))+fresh*2.5,0,6.29);ctx.fill();
          if(birth && fresh>0.55 && weaveBolts.length<8 && Math.random()<0.4) weaveBolts.push({x:p.x,y:p.y,life:0.9,segs:null,fr:0});
        }
        ctx.globalCompositeOperation='source-over';
      }

      // МОЛНИИ пробивают ядро (фаза пробоя)
      if(birth && bp>0.3 && bp<0.52 && weaveBolts.length<8 && Math.random()<0.28){ var pa=Math.random()*6.28; weaveBolts.push({x:CX+Math.cos(pa)*R*1.4,y:CY+Math.sin(pa)*R*1.4,life:1,segs:null,fr:0,pierce:1}); }
      // отрисовка плетущих/пробивающих молний (качественные, кэш формы)
      for(var wb=weaveBolts.length-1;wb>=0;wb--){ var W2=weaveBolts[wb];
        if(W2.fr%2===0||!W2.segs) W2.segs = W2.pierce ? segsB(W2.x,W2.y,CX,CY,22,4) : segsB(CX,CY,W2.x,W2.y,10,4); W2.fr++;
        drawWeave(W2.segs, W2.pierce?2.4:1.4, Math.min(1,W2.life*1.4)); W2.life-=0.13; if(W2.life<=0) weaveBolts.splice(wb,1); }
      // родные импульсы (живой орб)
      if(aliveA>0.5 && Math.random()<0.06) bolts.push({i:Math.floor(Math.random()*nodes.length),life:1});
      for(var b=bolts.length-1;b>=0;b--){ var bo=bolts[b]; bo.life-=0.08; if(bo.life<=0){bolts.splice(b,1);continue;}
        var pp=pc[bo.i]; ctx.strokeStyle='rgba(255,255,255,'+(bo.life*0.7)+')'; ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(CX,CY); for(var s=1;s<=4;s++){var f=s/4;ctx.lineTo(CX+(pp.x-CX)*f+(Math.random()-0.5)*14,CY+(pp.y-CY)*f+(Math.random()-0.5)*14);} ctx.stroke(); }

      // ВИХРЬ ЧАСТИЦ (влёт с краёв → орбита)
      for(var k=0;k<parts.length;k++){
        var pt=parts[k];
        var px,py,lifeA;
        if(birth && !dustAlive){
          // орбитальная цель
          var ox=CX+Math.cos(pt.a)*pt.rad, oy=CY+Math.sin(pt.a)*pt.rad*pt.ell;
          var ft=ez(Math.max(0,Math.min(1, dustFly + (k%20)/70)));
          px = pt.bfx + (ox-pt.bfx)*ft; py = pt.bfy + (oy-pt.bfy)*ft; lifeA=0.4+0.6*ft;
        } else {
          pt.a+=pt.sp; pt.rad-=pt.pull; pt.tw+=0.05;
          if(pt.rad<minR){ parts[k]=newPart(false); if(birth){ parts[k].bfx=px||CX; parts[k].bfy=py||CY; } continue; }
          px=CX+Math.cos(pt.a)*pt.rad; py=CY+Math.sin(pt.a)*pt.rad*pt.ell; lifeA=Math.min(1,(pt.rad-minR)/(R*0.5));
        }
        var flick=0.7+0.3*Math.sin(pt.tw), sz=pt.sz*(W/600);
        var pg=ctx.createRadialGradient(px,py,0,px,py,sz*3);
        pg.addColorStop(0,pal(pt.hue,0.8*lifeA*flick)); pg.addColorStop(1,pal(pt.hue,0));
        ctx.fillStyle=pg;ctx.beginPath();ctx.arc(px,py,sz*3,0,6.29);ctx.fill();
        ctx.fillStyle=pal(pt.hue,lifeA*flick);
        ctx.beginPath();ctx.arc(px,py,sz,0,6.29);ctx.fill();
      }

      // ЯДРО
      var cI=Math.max(coreI,aliveA);
      if(cI>0){
        var pulse=R*0.17+Math.sin(t*2.5)*R*0.04;
        var cg=ctx.createRadialGradient(CX,CY,0,CX,CY,pulse+R*0.16);
        cg.addColorStop(0,'rgba(255,255,255,'+cI+')');
        cg.addColorStop(0.18,'rgba(240,228,255,'+(0.9*cI)+')');
        cg.addColorStop(0.45,'rgba('+coreRGB[0]+','+coreRGB[1]+','+coreRGB[2]+','+(0.5*cI)+')');
        cg.addColorStop(1,'rgba('+coreRGB[0]+','+coreRGB[1]+','+coreRGB[2]+',0)');
        ctx.fillStyle=cg;ctx.beginPath();ctx.arc(CX,CY,pulse+R*0.16,0,6.29);ctx.fill();
      }

      // звезда-лучи / сердце / блик — только когда орб ожил
      if(aliveA>0){
        var flash=(0.55+Math.sin(t*3)*0.4)*aliveA, starR=R*0.27+Math.sin(t*2)*R*0.07;
        ctx.strokeStyle='rgba(255,255,255,'+flash+')'; ctx.lineWidth=2.5*(W/600);
        ctx.beginPath();ctx.moveTo(CX-starR,CY);ctx.lineTo(CX+starR,CY);ctx.moveTo(CX,CY-starR);ctx.lineTo(CX,CY+starR);ctx.stroke();
        ctx.strokeStyle='rgba('+coreRGB[0]+','+coreRGB[1]+','+coreRGB[2]+','+(flash*0.6)+')'; ctx.lineWidth=1.5*(W/600);
        var dR=starR*0.6;
        ctx.beginPath();ctx.moveTo(CX-dR,CY-dR);ctx.lineTo(CX+dR,CY+dR);ctx.moveTo(CX-dR,CY+dR);ctx.lineTo(CX+dR,CY-dR);ctx.stroke();
        ctx.fillStyle='rgba(255,255,255,'+((0.85+0.15*Math.sin(t*4))*aliveA)+')';
        ctx.beginPath();ctx.arc(CX,CY,(7+Math.sin(t*3)*2)*(W/600),0,6.29);ctx.fill();
        ctx.globalCompositeOperation='source-over';
        var hl=ctx.createRadialGradient(CX-R*0.35,CY-R*0.4,0,CX-R*0.35,CY-R*0.4,R*0.5);
        hl.addColorStop(0,'rgba(255,255,255,'+(0.12*aliveA)+')'); hl.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=hl;ctx.beginPath();ctx.arc(CX-R*0.35,CY-R*0.4,R*0.5,0,6.29);ctx.fill();
      }
    }

    // пауза когда не видно (экономия батареи)
    function visible(){ return canvas.offsetParent !== null; }
    var _lf = 0;
    function tick(ts){
      raf = requestAnimationFrame(tick);
      if (ts - _lf < 33) return;   // ~30 FPS
      _lf = ts;
      if(visible()) draw();
    }
    tick();
    // следим за сменой темы
    new MutationObserver(refreshTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    canvas._orbStop = function(){ if(raf){cancelAnimationFrame(raf);raf=null;} };
  }

  // авто-подключение всех canvas с классом .focus-orb-canvas
  function autoMount(){
    document.querySelectorAll('canvas.focus-orb-canvas').forEach(mount);
  }

  window.FocusOrb = { mount: mount, autoMount: autoMount };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', autoMount);
  else autoMount();
})();
