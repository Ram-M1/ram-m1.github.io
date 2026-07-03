/* FOCUS — анимированные фоны тем (Canvas)
   Рисует живой фон ЗА телефонной рамкой под активную тему.
   Пока с фоном идут 2 темы: cyberpunk (3D нейро-ландшафт), whitematrix (золото на белом).
   Для остальных тем фон не рисуется (у них статичный градиент как раньше).
   Подключать: <script src="focus-bg.js"></script> — сам создаёт canvas в body. */
(function(){
  'use strict';

  var canvas, ctx, raf, W, H, t=0, currentTheme='', engine=null;

  function makeCanvas(){
    canvas = document.createElement('canvas');
    canvas.id = 'focusThemeBg';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize(){
    if(!canvas) return;
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    if(engine && engine.onResize) engine.onResize();
  }

  /* ===== CYBERPUNK: 3D нейросеть-ландшафт ===== */
  function cyberpunkEngine(){
    var COLS=22, ROWS=12, hubs=[], flows=[], bokeh=[];
    function col(h,a){ return h<0.35?'rgba(0,220,255,'+a+')':(h<0.62?'rgba(60,255,180,'+a+')':(h<0.82?'rgba(255,61,224,'+a+')':'rgba(150,120,255,'+a+')')); }
    function init(){
      hubs=[]; for(var k=0;k<12;k++) hubs.push({i:1+Math.floor(Math.random()*(COLS-2)),j:1+Math.floor(Math.random()*(ROWS-3)),h:Math.random(),ph:Math.random()*6.28});
      flows=[]; for(var i=0;i<14;i++) flows.push({j:Math.floor(Math.random()*ROWS),p:Math.random(),sp:0.004+Math.random()*0.008,h:Math.random()});
      bokeh=[]; for(var i=0;i<30;i++) bokeh.push({x:Math.random()*W,y:Math.random()*H*0.6,r:8+Math.random()*30,h:Math.random(),tw:Math.random()*6.28,sp:0.2+Math.random()*0.4});
    }
    function gridPoint(i,j){
      var gx=(i/(COLS-1))-0.5, gz=j/(ROWS-1), persp=0.35+gz*0.65;
      var wave=Math.sin(gx*6+t*1.2)*0.06 + Math.sin(gz*5-t*1.5)*0.05 + Math.sin((gx+gz)*8+t)*0.03;
      return {x:W/2 + gx*W*1.15*persp, y:H*0.95 - gz*H*0.62 - wave*H*persp, depth:1-gz};
    }
    return {
      onResize: init,
      start: init,
      frame: function(){
        var bg=ctx.createRadialGradient(W/2,H*0.2,0,W/2,H*0.2,H*1.1);
        bg.addColorStop(0,'#0a2650'); bg.addColorStop(0.4,'#061838'); bg.addColorStop(1,'#040818');
        ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

        ctx.globalCompositeOperation='lighter';
        for(var i=0;i<bokeh.length;i++){
          var b=bokeh[i]; b.tw+=0.02; b.y+=Math.sin(t+i)*0.1;
          var a=(0.12+0.14*Math.sin(b.tw))*b.sp;
          var g=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
          g.addColorStop(0,col(b.h,a)); g.addColorStop(1,col(b.h,0));
          ctx.fillStyle=g; ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,6.29);ctx.fill();
        }

        var pts=[]; for(var j=0;j<ROWS;j++){ pts[j]=[]; for(var i=0;i<COLS;i++) pts[j][i]=gridPoint(i,j); }
        ctx.globalCompositeOperation='source-over';
        ctx.lineWidth=1;
        for(var j=0;j<ROWS;j++) for(var i=0;i<COLS;i++){
          var p=pts[j][i], dep=p.depth;
          if(i<COLS-1){ var pr=pts[j][i+1]; ctx.strokeStyle='rgba(0,200,255,'+(0.07+0.26*dep)+')'; ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(pr.x,pr.y);ctx.stroke(); }
          if(j<ROWS-1){ var pd=pts[j+1][i]; ctx.strokeStyle='rgba(0,180,255,'+(0.05+0.2*dep)+')'; ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(pd.x,pd.y);ctx.stroke(); }
          if(i<COLS-1&&j<ROWS-1){ var pg=pts[j+1][i+1]; ctx.strokeStyle='rgba(60,255,180,'+(0.03+0.1*dep)+')'; ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(pg.x,pg.y);ctx.stroke(); }
        }
        ctx.globalCompositeOperation='lighter';
        for(var f=0;f<flows.length;f++){
          var fl=flows[f]; fl.p+=fl.sp; if(fl.p>1)fl.p-=1;
          var ii=fl.p*(COLS-1), i0=Math.floor(ii), i1=Math.min(COLS-1,i0+1), ff=ii-i0;
          var pa=pts[fl.j][i0], pb=pts[fl.j][i1];
          var fx=pa.x+(pb.x-pa.x)*ff, fy=pa.y+(pb.y-pa.y)*ff, dep=pa.depth;
          var g=ctx.createRadialGradient(fx,fy,0,fx,fy,7*(0.5+dep));
          g.addColorStop(0,col(fl.h,0.9*dep)); g.addColorStop(1,col(fl.h,0));
          ctx.fillStyle=g; ctx.beginPath();ctx.arc(fx,fy,7*(0.5+dep),0,6.29);ctx.fill();
        }
        for(var j=0;j<ROWS;j++) for(var i=0;i<COLS;i++){
          var p=pts[j][i], dep=p.depth;
          ctx.fillStyle='rgba(120,240,255,'+(0.18+0.45*dep)+')';
          ctx.beginPath();ctx.arc(p.x,p.y,(0.8+1.8*dep),0,6.29);ctx.fill();
        }
        for(var k=0;k<hubs.length;k++){
          var hb=hubs[k], p=pts[hb.j][hb.i], dep=p.depth, pulse=0.6+0.4*Math.sin(t*2.5+hb.ph);
          var rr=(5+8*dep)*(0.85+0.2*Math.sin(t*3+hb.ph));
          var g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,rr*2.5);
          g.addColorStop(0,col(hb.h,0.7*pulse*dep)); g.addColorStop(0.5,col(hb.h,0.22*pulse*dep)); g.addColorStop(1,col(hb.h,0));
          ctx.fillStyle=g; ctx.beginPath();ctx.arc(p.x,p.y,rr*2.5,0,6.29);ctx.fill();
          ctx.strokeStyle=col(hb.h,0.6*dep); ctx.lineWidth=1.2;
          ctx.beginPath();
          for(var s=0;s<6;s++){ var ang=t*0.5+s*Math.PI/3; var hx=p.x+Math.cos(ang)*rr, hy=p.y+Math.sin(ang)*rr; if(s===0)ctx.moveTo(hx,hy);else ctx.lineTo(hx,hy); }
          ctx.closePath(); ctx.stroke();
          ctx.fillStyle='rgba(255,255,255,'+(pulse*dep)+')'; ctx.beginPath();ctx.arc(p.x,p.y,2*dep+1,0,6.29);ctx.fill();
          ctx.fillStyle='rgba(255,61,224,'+(0.8*pulse*dep)+')'; ctx.beginPath();ctx.arc(p.x,p.y,1*dep+0.5,0,6.29);ctx.fill();
        }
        ctx.globalCompositeOperation='source-over';
      }
    };
  }

  /* ===== WHITE MATRIX: золото на белом ===== */
  function whitematrixEngine(){
    var dust=[], gnodes=[];
    function init(){
      dust=[]; for(var i=0;i<70;i++) dust.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-0.5)*0.3,vy:-0.15-Math.random()*0.4,r:0.6+Math.random()*2.4,tw:Math.random()*6.28});
      gnodes=[]; for(var i=0;i<20;i++) gnodes.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-0.5)*0.25,vy:(Math.random()-0.5)*0.25});
    }
    return {
      onResize: init,
      start: init,
      frame: function(){
        ctx.fillStyle='#fafaf7'; ctx.fillRect(0,0,W,H);
        // мягкие золотые волны
        ctx.strokeStyle='rgba(201,154,46,0.1)'; ctx.lineWidth=1;
        for(var w=0;w<3;w++){
          ctx.beginPath();
          for(var xx=0;xx<=W;xx+=10){ var yy=H*0.5+Math.sin(xx*0.006+t*1.1+w*2)*(40+w*18)+w*30; if(xx===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy); }
          ctx.stroke();
        }
        // сеть золотых узлов
        for(var i=0;i<gnodes.length;i++){
          var n=gnodes[i]; n.x+=n.vx; n.y+=n.vy;
          if(n.x<0||n.x>W)n.vx*=-1; if(n.y<0||n.y>H)n.vy*=-1;
          for(var j=i+1;j<gnodes.length;j++){
            var m=gnodes[j], dx=n.x-m.x, dy=n.y-m.y, d=Math.sqrt(dx*dx+dy*dy);
            if(d<130){ ctx.strokeStyle='rgba(201,154,46,'+((1-d/130)*0.28)+')'; ctx.lineWidth=0.6; ctx.beginPath();ctx.moveTo(n.x,n.y);ctx.lineTo(m.x,m.y);ctx.stroke(); }
          }
        }
        for(var i=0;i<gnodes.length;i++){ var n=gnodes[i]; ctx.fillStyle='rgba(201,154,46,0.65)';ctx.beginPath();ctx.arc(n.x,n.y,2,0,6.29);ctx.fill(); }
        // золотая пыль вверх
        for(var k=0;k<dust.length;k++){
          var d=dust[k]; d.x+=d.vx; d.y+=d.vy; d.tw+=0.05;
          if(d.y<-5){d.y=H+5;d.x=Math.random()*W;}
          var a=(0.35+0.35*Math.sin(d.tw))*0.7;
          var g=ctx.createRadialGradient(d.x,d.y,0,d.x,d.y,d.r*3);
          g.addColorStop(0,'rgba(230,190,90,'+a+')'); g.addColorStop(1,'rgba(201,154,46,0)');
          ctx.fillStyle=g;ctx.beginPath();ctx.arc(d.x,d.y,d.r*3,0,6.29);ctx.fill();
          ctx.fillStyle='rgba(201,154,46,'+a+')';ctx.beginPath();ctx.arc(d.x,d.y,d.r*0.6,0,6.29);ctx.fill();
        }
      }
    };
  }

  var ENGINES = { cyberpunk: cyberpunkEngine, whitematrix: whitematrixEngine };

  function applyTheme(){
    var th = document.documentElement.getAttribute('data-theme') || 'original';
    if(th === currentTheme) return;
    currentTheme = th;
    if(ENGINES[th]){
      if(!canvas) makeCanvas();
      canvas.style.display = 'block';
      engine = ENGINES[th]();
      engine.start();
    } else {
      // тема без анимированного фона — прячем canvas
      if(canvas) canvas.style.display = 'none';
      engine = null;
    }
  }

  function loop(){
    t += 0.016;
    if(engine && canvas && canvas.style.display !== 'none'){
      engine.frame();
    }
    raf = requestAnimationFrame(loop);
  }

  function boot(){
    applyTheme();
    new MutationObserver(applyTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    loop();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
