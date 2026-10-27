/* STUDIO_REAL · conducteur — données de démonstration, catalogues, palettes, aperçus des étapes de base. */
(function(){
const FC={trig:'#e59578',flow:'#b9cfd8',data:'#78b08f',cible:'#d9a486',fx:'#e0674a',ui:'#f0b49b',scene:'#8fa5ad',gate:'#d47a5c'};
const LIGHT={'#b9cfd8':'#2c5363','#f0b49b':'#a3502f','#e59578':'#b8492e','#d9a486':'#7a3a22','#78b08f':'#24613f','#8fa5ad':'#4a5f66','#d47a5c':'#a3502f','#e0674a':'#b8492e','#a3aea8':'#3a4440','#76878e':'#4a5f66'};
const lc=(h,light)=>light?(LIGHT[h]||h):h;
const GRP=[
 ['deroule','Le déroulé','les étapes de base du spectacle','M4 6h16M4 12h10M4 18h13'],
 ['trig','Quand','ce qui déclenche une action',''],
 ['flow','Comment','aiguillages, attentes, tirages',''],
 ['data','Combien','votes, comptes, scores',''],
 ['cible','Qui','quelle partie du public',''],
 ['fx','Effets téléphone','lumière, vibration, son',''],
 ['ui','Écrans du public','ce que voit le téléphone',''],
 ['scene','Scène et régie','écran, streamer, console',''],
 ['gate','Points d’arrêt','attendre une décision humaine','']];
const ST=(a,b)=>[['intensité',a,0,100,' %',0],['fondu',b,0,10,' s',1]];
const CK=[
 ['k:attente','attente du public','ATTENTE','attente','#b9cfd8','On attend la salle. L’étape se termine dès qu’une condition de sortie est remplie.',ST(.4,.3)],
 ['k:calage','calage salle','CALAGE','calage','#d9a486','Dernier calage son et lumière. On passe quand la salle s’est calmée.',ST(.5,.4)],
 ['k:scene','scène jouée','SCÈNE','scene','#d47a5c','Les comédiens jouent. La suite part à la fin de la durée prévue ou au top.',ST(.7,.4)],
 ['k:son','son en salle','SON','son','#e59578','Lecture d’une piste sur la sono de la salle.',[['volume',.75,0,100,' %',0],['fondu',.3,0,10,' s',1]]],
 ['k:lum','lumière','LUMIÈRE','lumiere','#f0b49b','Conduite lumière vers l’intensité choisie, avec un temps de montée.',[['intensité',.6,0,100,' %',0],['montée',.4,0,10,' s',1]]],
 ['k:fondu','fondu','FONDU','fondu','#8fa5ad','Fondu enchaîné entre deux états du plateau.',ST(.1,.6)],
 ['k:passage','liaison','LIAISON','passage','#8fa5ad','Étape de liaison, sans action propre.',ST(.3,.5)],
 ['k:issue','issue','ISSUE','issue','#78b08f','Une des issues possibles. Elle est jouée si le public la choisit.',ST(.7,.4)]];
const ASSETS=[
 {k:'son',n:'Sons',items:[['ouverture.wav','stéréo · 48 kHz',148],['pluie_toit.wav','ambiance',70],['cloche.wav','effet',4],['montee_climax.wav','musique',238],['souffle.wav','effet',22],['salut.wav','musique',118]]},
 {k:'lx',n:'Lumières · mémoires',items:[['LX 01 · Aube','45 %',30],['LX 12 · Noir salle','0 %',22],['LX 20 · Douche centre','80 %',60],['LX 31 · Vague bleue','100 %',46],['LX 40 · Strobe','3 Hz',28],['LX 99 · Salut','90 %',118]]},
 {k:'video',n:'Vidéos · écran de scène',items:[['generique.mp4','1080p',48],['pluie_ville.mp4','1080p',130],['carte_metro.mp4','4K',35],['credits.mp4','1080p',90]]},
 {k:'img',n:'Images',items:[['affiche.png','4K',20],['plan_salle.png','A3',20],['visage_milo.jpg','1080p',20]]},
 {k:'txt',n:'Textes · consignes',items:[['Où doit-il aller ?','question',20],['Garde-le pour toi','message privé',12],['Va vers la boulangerie','streamer',15],['Rallumez vos téléphones','salle',20]]},
 {k:'role',n:'Rôles et équipes',items:[['Milo · streamer','1 personne',0],['Superviseur','1 personne',0],['Corbeaux','36 joueurs',0],['Lucioles','35 joueurs',0]]},
 {k:'tel',n:'Écrans téléphone',items:[['Vote à 3 choix','écran type',30],['Clavier libre','écran type',30],['Réactions','écran type',30],['Patientez','écran type',30]]},
 {k:'osc',n:'Commandes OSC · MIDI',items:[['/lx/12','osc',4],['/qlab/cue/12','osc',4],['note C3 · canal 1','midi',4]]}];
const AG={son:'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',lx:'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',video:'M3 6h13v12H3zM16 10l5-3v10l-5-3',img:'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',txt:'M5 6h14M5 10h14M5 14h9M5 18h6',role:'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 21c.8-4 3.6-6 7-6s6.2 2 7 6',tel:'M8 2h8v20H8zM11 18h2',osc:'M2 12h4l3-7 4 14 3-9 2 2h4',notes:'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h6',curve:'M3 17c4 0 5-10 9-10s5 10 9 10'};
const AC={son:'#e59578',lx:'#f0b49b',video:'#b9cfd8',img:'#8fa5ad',txt:'#d9a486',role:'#d9a486',tel:'#78b08f',osc:'#d47a5c'};
const AT={son:'son',lx:'lx',osc:'lx',video:'video',img:'video',txt:'txt',tel:'tel',role:null};
const AN={son:'k:son',lx:'k:lum',osc:'s3',video:'s1',img:'s1',txt:'x6',tel:'u3',role:'c1'};
const TT={son:['Son','#e59578','Pistes son posées sur le temps'],lx:['Lumière · cues','#f0b49b','Mémoires de la console lumière'],video:['Écran de scène','#b9cfd8','Vidéos et images projetées'],tel:['Téléphones','#78b08f','Écrans poussés au public'],txt:['Textes','#d9a486','Consignes, surtitres, messages'],notes:['Notes de régie','#a3aea8','Repères écrits pour l’équipe'],curve:['Courbe libre','#8fa5ad','Une intensité dessinée à la main'],secu:['Sécurité','#c8311f','Alertes avant strobe, fumée, entrées de public']};

function mk(){ const S=(id,name,ty,dur,c,r,a,b)=>({id,name,ty,c,r,dx:0,dy:0,k:[Math.round((dur-10)/6),a==null?50:a,b==null?50:b]}), G=(k,op,v)=>({k,op,v});
 const ev=[
  {id:'e1',act:0,name:'Entrée du public',entry:'portes',st:[S('portes','Portes ouvertes','k:attente',240,0,0,40,30),S('calage','Calage salle','k:calage',90,1,0,55,40),S('noir','Noir salle','k:fondu',22,2,0,5,80)],tr:[{a:'portes',b:'calage',mode:'any',g:[G('pres','≥',114),G('t','≥',420)]},{a:'calage',b:'noir',g:[G('bruit','≤',40)]}],gate:{mode:'go',g:[G('bruit','≤',40)]}},
  {id:'e2',act:0,name:'Prologue',entry:'voix',st:[Object.assign(S('voix','Voix off','k:son',148,0,0,75,30),{asset:'ouverture.wav'}),S('aube','Lumière lente','k:lum',178,1,0,45,90),S('appar','Apparition','k:scene',118,2,0,75,30)],tr:[{a:'voix',b:'aube',g:[]},{a:'aube',b:'appar',g:[]}],gate:{mode:'auto',g:[]}},
  {id:'e3',act:1,name:'Vote du public',entry:'quest',st:[S('quest','Question au public','u1',34,0,0,60),S('vote','Votes reçus','b3',94,1,0,20),S('depou','Décompte','d1',16,2,0,50),S('issA','La fuite','k:issue',22,3,-1,70,40),S('issB','Le pacte','k:issue',22,3,0,70,40),S('tir','Égalité · tirage','k:issue',22,3,1,70,40)],tr:[{a:'quest',b:'vote',g:[]},{a:'vote',b:'depou',g:[G('quorum','≥',60),G('t','≥',90)]},{a:'depou',b:'issA',g:[G('issue','=','A')]},{a:'depou',b:'issB',g:[G('issue','=','B')]},{a:'depou',b:'tir',g:[G('issue','=','T')]}],gate:{mode:'go',g:[]}},
  {id:'e4',act:1,name:'Scène selon le choix',entry:{A:'jeuA',B:'jeuB',T:'jeuA'},st:[S('jeuA','Scène A · la fuite','k:scene',418,0,-.55,80,40),S('jeuB','Scène B · le pacte','k:scene',382,0,.55,65,40),S('basc','Bascule','k:passage',40,1,0,30,70)],tr:[{a:'jeuA',b:'basc',g:[]},{a:'jeuB',b:'basc',g:[]}],gate:{mode:'auto',g:[]}},
  {id:'e5',act:1,name:'Vague de lumière',entry:'prep',st:[S('prep','Préparer les téléphones','u3',58,0,0),S('vague','La vague','x2',46,1,0,50),S('retour','Retour au noir','k:fondu',22,2,0,5,80)],tr:[{a:'prep',b:'vague',g:[G('prets','≥',70)]},{a:'vague',b:'retour',g:[]}],gate:{mode:'go',g:[G('bruit','≤',40)]}},
  {id:'e6',act:2,name:'Climax',entry:'montee',st:[Object.assign(S('montee','Montée','k:son',238,0,0,85,60),{asset:'montee_climax.wav'}),S('pic','Le pic','x3',28,1,0,50),S('silence','Silence','k:fondu',28,2,0,0,50)],tr:[{a:'montee',b:'pic',g:[]},{a:'pic',b:'silence',g:[]}],gate:{mode:'auto',g:[]}},
  {id:'e7',act:2,name:'Salut et sortie',entry:'salut',st:[S('salut','Salut','k:scene',118,0,0,85,40),S('sortie','Sortie du public','k:attente',298,1,0,50,60)],tr:[{a:'salut',b:'sortie',g:[]}],gate:{mode:'auto',g:[]}}];
 ev.forEach(e=>e.tr.forEach(t=>{t.mode=t.mode||'all'}));
 const tracks=[
  {id:'t1',type:'curve',src:'tens',name:'Tension dramatique',col:'#e59578',open:true,pts:{e1:22,e2:34,e3:52,e4:70,e5:60,e6:92,e7:28}},
  {id:'t2',type:'curve',src:'lum',name:'Lumière générale',col:'#b9cfd8',open:false},
  {id:'t3',type:'curve',src:'pub',name:'Participation',col:'#78b08f',open:false},
  {id:'t4',type:'son',name:'Son',open:true,clips:[{id:'c1',name:'ouverture.wav',ev:'e2',off:0,dur:148},{id:'c2',name:'pluie_toit.wav',ev:'e4',off:30,dur:70},{id:'c3',name:'montee_climax.wav',ev:'e6',off:0,dur:238}]},
  {id:'t5',type:'lx',name:'Lumière · cues',open:true,clips:[{id:'c4',name:'LX 12 · Noir salle',ev:'e1',off:330,dur:22},{id:'c5',name:'LX 01 · Aube',ev:'e2',off:148,dur:30},{id:'c6',name:'LX 31 · Vague bleue',ev:'e5',off:58,dur:46},{id:'c7',name:'LX 99 · Salut',ev:'e7',off:0,dur:118}]},
  {id:'t7',type:'secu',name:'Sécurité',open:true,marks:[{id:'s1',ev:'e1',off:40,txt:'Ouverture des portes · public en mouvement',lead:8},{id:'s2',ev:'e6',off:238,txt:'Strobe 3 Hz · prévenir la salle',lead:10},{id:'s3',ev:'e7',off:118,txt:'Sortie du public · rallumer la salle',lead:8}]},
  {id:'t6',type:'notes',name:'Notes de régie',open:true,marks:[{id:'k1',ev:'e1',off:60,txt:'Ouvrir les portes côté jardin'},{id:'k2',ev:'e4',off:0,txt:'Vérifier le retour streamer'},{id:'k3',ev:'e6',off:200,txt:'Prévenir la sécurité : strobe'}]}];
 return {acts:[{n:'Accueil'},{n:'Le choix'},{n:'Dénouement'}],ev,sens:{aff:60,part:55,calme:50,pen:62},hold:{},go:{},ver:1,nid:100,tracks} }

const PAL={};
function pal(th){ if(PAL[th]) return PAL[th]; const L=th==='light';
 const C={'--bg':L?'#dcdbd3':'#070a08','--panel':L?'#f5f4f0':'#0f1311','--panel2':L?'#cfcec5':'#141a17','--panel3':L?'#bdbcb2':'#222a26','--ink':L?'#141a17':'#e6eae7','--ink2':L?'#3a4440':'#a3aea8','--ink3':L?'#59635e':'#7f8b86','--cy':L?'#2c5363':'#b9cfd8','--or':L?'#b8492e':'#e0674a','--grn':L?'#24613f':'#2f6b4a','--grn2':L?'#24613f':'#78b08f','--amb':L?'#a3502f':'#f0b49b','--rouge':L?'#a3502f':'#e0674a','--line':L?'rgba(24,34,29,.22)':'rgba(185,207,216,.2)','--line-amb':'rgba(229,149,120,.6)','--line-cy':'rgba(185,207,216,.5)','--dot':L?'rgba(24,34,29,.1)':'rgba(185,207,216,.1)','--dot-hi':L?'rgba(24,34,29,.25)':'rgba(185,207,216,.28)','--coral-1':'#f0b49b','--coral-2':'#e59578','--coral-3':'#d47a5c','--spec-1':'#24543b','--spec-2':'#2f6b4a','--spec-3':'#78b08f','--spec-4':'#f0b49b','--black':'#000','--veil':L?'rgba(233,232,226,.75)':'rgba(10,13,11,.75)','--on-or':L?'#fdf3ee':'#170c08','--on-amb':L?'#fdf3ee':'#170c08','--on-grn':'#e6f1ea','--on-rouge':'#fdf3ee','--salle-noir':L?'#1a1f1c':'#050706','--titre-clair':'#f3efe8','--titre-sombre':'#170c08','--exec':L?'#141a17':'#e6eae7','--t-num':'#78b08f','--t-txt':'#b9cfd8','--t-bool':'#f0b49b','--t-cible':'#d9a486','--t-media':'#d47a5c','--nd-ryt':'#b9cfd8'};
 Object.keys(FC).forEach(k=>{C['--fam-'+k]=lc(FC[k],L)});
 const PS=['#f0b49b','#e59578','#d47a5c','#a3502f','#78b08f','#3f9a6a','#2f6b4a','#b9cfd8','#8fa5ad','#d9a486','#c98b6b','#9fc4ae']; PS.forEach((v,i)=>{C['--pseudo-'+(i+1)]=v}); PS.slice(0,8).forEach((v,i)=>{C['--eq-'+(i+1)]=v});
 return PAL[th]=C }

const fm=s=>{ s=Math.max(0,Math.round(s)); return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0') };
const KD={
 attente(c,w,h,t,C,o,X){ const n=Math.max(0,Math.round(o.val||0)),cols=17,rows=4,cw=7,g=2.4,x0=12,y0=14,on=Math.round(n/142*cols*rows);
  for(let r=0;r<rows;r++) for(let i=0;i<cols;i++) X.fr(c,x0+i*(cw+g),y0+r*(cw+g),cw,cw,r*cols+i<on?o.k:C['--panel3']);
  X.tx(c,'SCÈNE',x0,y0+rows*(cw+g)+7,X.F.m(6),C['--ink3'],'left','1px'); X.tx(c,String(n),w-12,h-20,X.F.d(18),C['--cy'],'right','1px'); X.tx(c,'ASSIS · 142 PLACES',12,h-10,X.F.m(6.5),C['--ink3'],'left','1px') },
 calage(c,w,h,t,C,o,X){ const db=o.val==null?50:o.val,segs=26,x0=12,W=w-24,sw=W/segs;
  for(let i=0;i<segs;i++){ const lv=32+i*40/segs; X.fr(c,x0+i*sw,26,sw-2,18,lv<=db?(lv>40?C['--or']:C['--grn2']):C['--panel3']) }
  const tx=x0+.2*W; X.fr(c,tx-.75,20,1.5,30,C['--ink']); X.tx(c,'SEUIL 40 DB',tx,12,X.F.m(6.5),C['--ink2'],'center','1px');
  X.tx(c,Math.round(db)+' DB',12,h-16,X.F.d(15),db<=40?C['--grn2']:C['--or'],'left','1px'); X.tx(c,db<=40?'SALLE CALME':'BRUIT DE SALLE',w-12,h-16,X.F.m(7),C['--ink3'],'right','1px') },
 scene(c,w,h,t,C,o,X){ X.tx(c,fm(o.run?o.rem:o.dur),12,30,X.F.d(24),o.run?o.k:C['--ink2'],'left','2px'); X.tx(c,o.run?'EN SCÈNE':o.prog>=1?'JOUÉE':'PRÊTE',w-12,14,X.F.m(7),o.run?C['--or']:C['--ink3'],'right','1px');
  const x0=12,W=w-24; for(let i=0;i<=30;i++) X.fr(c,x0+i*W/30,56,1,i%5?4:8,C['--ink3']); X.fr(c,x0,70,W,2,C['--panel3']); X.fr(c,x0,70,W*o.prog,2,o.k); X.tx(c,'DURÉE PRÉVUE '+fm(o.dur),12,h-8,X.F.m(6.5),C['--ink3'],'left','1px') },
 son(c,w,h,t,C,o,X){ const x0=12,W=w-24,mid=36,A=22,n=110;
  for(let i=0;i<n;i++){ const u=i/n,a=(.3+.7*Math.abs(Math.sin(u*17.3+1.1)*Math.sin(u*5.1+.4)))*(.55+.45*Math.abs(Math.sin(u*61+.3))); c.globalAlpha=u<=o.prog?1:.45; X.fr(c,x0+u*W,mid-a*A,1.1,Math.max(1,2*a*A),u<=o.prog?o.k:C['--ink3']) } c.globalAlpha=1;
  if(o.run) X.fr(c,x0+W*o.prog-.75,mid-A-4,1.5,2*A+8,C['--or']);
  X.tx(c,String(o.asset||'piste son').slice(0,22).toUpperCase(),12,h-9,X.F.m(6.5),C['--ink3'],'left','1px'); X.tx(c,fm(o.run?o.rem:o.dur),w-12,h-9,X.F.d(10),C['--cy'],'right') },
 lumiere(c,w,h,t,C,o,X){ const tg=o.p[0]||0,fr=Math.max(.05,Math.min(.9,(o.p[1]||.4)*.5)),cur=o.run?tg*Math.min(1,o.prog/fr):o.prog>=1?tg:0;
  X.fr(c,22,12,4,h-24,C['--panel3']); const ky=12+(h-24)*(1-cur); X.fr(c,13,ky-4,22,8,C['--ink']); X.fr(c,13,ky-.5,22,1,C['--panel3']);
  X.tx(c,Math.round(cur*100)+' %',48,24,X.F.d(18),C['--cy'],'left','1px'); X.tx(c,'CIBLE '+Math.round(tg*100)+' %',w-12,24,X.F.m(6.5),C['--ink3'],'right','1px');
  const x0=48,W=w-60,yb=78,H=30; X.fr(c,x0,yb,W,1,C['--panel3']); c.strokeStyle=o.k; c.lineWidth=1.5; c.beginPath(); c.moveTo(x0,yb); c.lineTo(x0+W*fr,yb-H*tg); c.lineTo(x0+W,yb-H*tg); c.stroke();
  if(o.prog>0) X.fr(c,x0+W*Math.min(1,o.prog)-.75,yb-H-4,1.5,H+6,C['--or']) },
 fondu(c,w,h,t,C,o,X){ const x0=14,W=w-28,y0=14,H=48; c.lineWidth=1.5; c.strokeStyle=C['--ink3']; c.beginPath(); c.moveTo(x0,y0); c.bezierCurveTo(x0+W*.55,y0,x0+W*.45,y0+H,x0+W,y0+H); c.stroke();
  c.strokeStyle=o.k; c.beginPath(); c.moveTo(x0,y0+H); c.bezierCurveTo(x0+W*.55,y0+H,x0+W*.45,y0,x0+W,y0); c.stroke(); X.fr(c,x0+W*o.prog-.75,y0-4,1.5,H+8,C['--or']);
  X.tx(c,'AVANT',x0,h-10,X.F.m(6.5),C['--ink3'],'left','1px'); X.tx(c,'APRÈS',x0+W,h-10,X.F.m(6.5),o.k,'right','1px'); X.tx(c,fm(o.run?o.rem:o.dur),w/2,h-10,X.F.d(10),C['--cy'],'center') },
 passage(c,w,h,t,C,o,X){ const y=38,x0=12,W=w-24; for(let i=0;i<W/8;i++) X.fr(c,x0+i*8,y,4,1.5,C['--ink3']);
  for(let k=0;k<3;k++){ const x=x0+((t*.5+k/3)%1)*W; c.globalAlpha=o.run?1:.35; c.fillStyle=o.k; c.beginPath(); c.moveTo(x,y-6); c.lineTo(x+8,y+.75); c.lineTo(x,y+7.5); c.closePath(); c.fill(); c.globalAlpha=1 }
  X.tx(c,'LIAISON',12,h-12,X.F.m(7),C['--ink3'],'left','1px'); X.tx(c,fm(o.run?o.rem:o.dur),w-12,h-12,X.F.d(11),C['--cy'],'right') },
 issue(c,w,h,t,C,o,X){ const ch=!!o.chosen; X.fr(c,12,14,56,56,ch?o.k:C['--panel2']); X.tx(c,o.lab||'A',40,43,X.F.d(26),ch?C['--on-or']:C['--ink3'],'center');
  X.tx(c,ch?'CHOISIE':'NON CHOISIE',82,24,X.F.m(7),ch?C['--grn2']:C['--ink3'],'left','1px'); X.tx(c,(o.pct||0)+' %',82,46,X.F.d(16),C['--cy'],'left','1px'); X.tx(c,'DES VOIX',82,64,X.F.m(6.5),C['--ink3'],'left','1px') }};

function stepS(S,dt,V){ const now=performance.now()/1000; S.el+=dt; S.remain=90-(S.el%90);
 S.energy=Math.max(0,Math.min(1,S.energy+(Math.random()-.5)*dt*1.6)); S._e+=dt;
 if(S._e>.08){ S._e=0; S.en.push(S.energy); S.en.shift(); S.jauge=Math.max(0,Math.min(1000,S.jauge+(Math.random()-.45)*30)); S.jh.push(S.jauge); S.jh.shift() }
 S._vc+=dt; const nv=Math.round(S.total*Math.min(1,(S._vc%16)/12)); if(nv>S.voted) S.lastVote=now; S.voted=nv;
 const f=S.voted/S.total; S.votes=[V.A,V.B,V.C].map(v=>Math.round(v*.8*f)); S.win=S.votes.indexOf(Math.max(...S.votes));
 S._m+=dt; if(S._m>3.2){ S._m=0; S.msgI++; S.msgT=now }
 S._c+=dt; if(S._c>1.4){ S._c=0; S.counter++ }
 S.lockOpen=Math.floor(now/4)%2===0; S.recu=Math.floor(now/5)%2===1; const b=Math.floor(now/6); if(b!==S._b){ S._b=b; S.btnT=now } }
function newS(){ return {el:0,voted:0,total:142,lastVote:0,msgI:0,msgT:0,rate:38,en:Array(60).fill(.25),energy:.3,btnT:-9,win:0,votes:[0,0,0],counter:0,lockOpen:false,jauge:420,jh:Array(40).fill(420),remain:90,recu:false,vibeFix:true,_e:0,_vc:0,_m:0,_c:0,_b:0} }

const WF={};
function wf(id){ if(WF[id]) return WF[id]; let sd=0; for(const ch of id) sd=(sd*31+ch.charCodeAt(0))%9973; const n=60,pts=[];
 for(let i=0;i<=n;i++){ const u=i/n; pts.push((.25+.75*Math.abs(Math.sin(u*13+sd)*Math.sin(u*3.7+sd*.3)))*(.55+.45*Math.abs(Math.sin(u*41+sd*1.7)))) }
 let d='M0 10'; pts.forEach((a,i)=>{ d+=' L'+(i/n*100).toFixed(1)+' '+(10-a*9).toFixed(2) }); for(let i=n;i>=0;i--) d+=' L'+(i/n*100).toFixed(1)+' '+(10+pts[i]*9).toFixed(2);
 return WF[id]=d+' Z' }
const CLIPD={lx:'M0 20 L12 3 L100 3 L100 20 Z',video:Array.from({length:10},(_,i)=>'M'+(i*10+1)+' 3h8v14h-8z').join(''),tel:Array.from({length:20},(_,i)=>'M'+(i*5+1)+' 8h2v4h-2z').join(''),txt:'M2 5h60v2h-60zM2 10h80v2h-80zM2 15h45v2h-45z'};

window.SRC={FC,lc,GRP,CK,ASSETS,AG,AC,AT,AN,TT,mk,pal,KD,stepS,newS,wf,CLIPD,fm};
})();
