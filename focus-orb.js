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

    function proj(lat,lon,rot){
      var x=Math.cos(lat)*Math.cos(lon+rot), y=Math.sin(lat), z=Math.cos(lat)*Math.sin(lon+rot);
      return {x:CX+x*R, y:CY+y*R*0.98, z:z};
    }

    var t=0, raf=null, minR=R*0.1;
    function draw(){
      t+=0.016;
      ctx.clearRect(0,0,W,H);
      var rot=t*0.22;

      // фоновое свечение
      var g=ctx.createRadialGradient(CX,CY,0,CX,CY,R+R*0.16);
      g.addColorStop(0,'rgba('+coreRGB[0]+','+coreRGB[1]+','+coreRGB[2]+',0.28)');
      g.addColorStop(0.4,'rgba('+gridRGB[0]+','+gridRGB[1]+','+gridRGB[2]+',0.12)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(CX,CY,R+R*0.16,0,6.29);ctx.fill();

      // проекция узлов
      var pc=[]; for(var i=0;i<nodes.length;i++) pc[i]=proj(nodes[i].lat,nodes[i].lon,rot);

      // сетка
      ctx.lineWidth=1;
      for(var i=0;i<nodes.length;i++){
        var p=pc[i], depth=(p.z+1)/2;
        for(var j=i+1;j<nodes.length;j++){
          var dl=Math.abs(nodes[i].lat-nodes[j].lat), dg=Math.abs(nodes[i].lon-nodes[j].lon);
          if(dl<lineNear&&(dg<lineNear+0.02||dg>6.28-lineNear-0.02)){
            var p2=pc[j], d2=(p2.z+1)/2, al=0.1+0.38*((depth+d2)/2);
            ctx.strokeStyle='rgba('+gridRGB[0]+','+gridRGB[1]+','+gridRGB[2]+','+al+')';
            ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p2.x,p2.y);ctx.stroke();
          }
        }
      }
      // узлы
      ctx.globalCompositeOperation='lighter';
      for(var i=0;i<nodes.length;i++){
        var p=pc[i], depth=(p.z+1)/2, tw=0.6+0.4*Math.sin(t*3+nodes[i].ph);
        ctx.fillStyle='rgba('+Math.min(255,gridRGB[0]+80)+','+Math.min(255,gridRGB[1]+40)+','+Math.min(255,gridRGB[2]+40)+','+((0.25+0.65*depth)*tw)+')';
        ctx.beginPath();ctx.arc(p.x,p.y,(1.2+2.2*depth)*(W/600),0,6.29);ctx.fill();
      }

      // молнии
      if(Math.random()<0.06) bolts.push({i:Math.floor(Math.random()*nodes.length),life:1});
      for(var b=bolts.length-1;b>=0;b--){
        var bo=bolts[b]; bo.life-=0.08;
        if(bo.life<=0){bolts.splice(b,1);continue;}
        var p=pc[bo.i];
        ctx.strokeStyle='rgba(255,255,255,'+(bo.life*0.7)+')'; ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(CX,CY);
        for(var s=1;s<=4;s++){ var f=s/4; ctx.lineTo(CX+(p.x-CX)*f+(Math.random()-0.5)*14,CY+(p.y-CY)*f+(Math.random()-0.5)*14); }
        ctx.stroke();
      }

      // вихрь частиц
      for(var k=0;k<parts.length;k++){
        var pt=parts[k];
        pt.a+=pt.sp; pt.rad-=pt.pull; pt.tw+=0.05;
        if(pt.rad<minR){ parts[k]=newPart(false); continue; }
        var px=CX+Math.cos(pt.a)*pt.rad, py=CY+Math.sin(pt.a)*pt.rad*pt.ell;
        var lifeA=Math.min(1,(pt.rad-minR)/(R*0.5)), flick=0.7+0.3*Math.sin(pt.tw), sz=pt.sz*(W/600);
        var pg=ctx.createRadialGradient(px,py,0,px,py,sz*3);
        pg.addColorStop(0,pal(pt.hue,0.8*lifeA*flick)); pg.addColorStop(1,pal(pt.hue,0));
        ctx.fillStyle=pg;ctx.beginPath();ctx.arc(px,py,sz*3,0,6.29);ctx.fill();
        ctx.fillStyle=pal(pt.hue,lifeA*flick);
        ctx.beginPath();ctx.arc(px,py,sz,0,6.29);ctx.fill();
      }

      // ядро
      var pulse=R*0.17+Math.sin(t*2.5)*R*0.04;
      var cg=ctx.createRadialGradient(CX,CY,0,CX,CY,pulse+R*0.16);
      cg.addColorStop(0,'rgba(255,255,255,1)');
      cg.addColorStop(0.18,'rgba(240,228,255,0.9)');
      cg.addColorStop(0.45,'rgba('+coreRGB[0]+','+coreRGB[1]+','+coreRGB[2]+',0.5)');
      cg.addColorStop(1,'rgba('+coreRGB[0]+','+coreRGB[1]+','+coreRGB[2]+',0)');
      ctx.fillStyle=cg;ctx.beginPath();ctx.arc(CX,CY,pulse+R*0.16,0,6.29);ctx.fill();

      // звезда-лучи
      var flash=0.55+Math.sin(t*3)*0.4, starR=R*0.27+Math.sin(t*2)*R*0.07;
      ctx.strokeStyle='rgba(255,255,255,'+flash+')'; ctx.lineWidth=2.5*(W/600);
      ctx.beginPath();ctx.moveTo(CX-starR,CY);ctx.lineTo(CX+starR,CY);ctx.moveTo(CX,CY-starR);ctx.lineTo(CX,CY+starR);ctx.stroke();
      ctx.strokeStyle='rgba('+coreRGB[0]+','+coreRGB[1]+','+coreRGB[2]+','+(flash*0.6)+')'; ctx.lineWidth=1.5*(W/600);
      var dR=starR*0.6;
      ctx.beginPath();ctx.moveTo(CX-dR,CY-dR);ctx.lineTo(CX+dR,CY+dR);ctx.moveTo(CX-dR,CY+dR);ctx.lineTo(CX+dR,CY-dR);ctx.stroke();

      // сердце
      ctx.fillStyle='rgba(255,255,255,'+(0.85+0.15*Math.sin(t*4))+')';
      ctx.beginPath();ctx.arc(CX,CY,(7+Math.sin(t*3)*2)*(W/600),0,6.29);ctx.fill();

      // стеклянный блик
      ctx.globalCompositeOperation='source-over';
      var hl=ctx.createRadialGradient(CX-R*0.35,CY-R*0.4,0,CX-R*0.35,CY-R*0.4,R*0.5);
      hl.addColorStop(0,'rgba(255,255,255,0.12)'); hl.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=hl;ctx.beginPath();ctx.arc(CX-R*0.35,CY-R*0.4,R*0.5,0,6.29);ctx.fill();

      raf=requestAnimationFrame(draw);
    }

    // пауза когда не видно (экономия батареи)
    function visible(){ return canvas.offsetParent !== null; }
    function loop(){ if(visible()){ if(!raf) draw(); } else { if(raf){ cancelAnimationFrame(raf); raf=null; } } }
    draw();
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
