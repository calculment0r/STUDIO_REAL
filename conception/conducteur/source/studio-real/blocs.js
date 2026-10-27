/* STUDIO_REAL — catalogue des blocs du canvas + leurs aperçus vivants (dessinés sur <canvas>, couleurs lues dans les jetons). */
(function(){
const HD=23,PH=92,ROWH=18,SETH=19;
const PSEUDOS=['Zoé42','Max','Léa','Inès_b','Tom','Kenji','Sacha','Nour','Yanis','Camille.R','Bastien','Mila'];
const MSGS=[['trop bien 🔥','Zoé42'],['va au métro !','Kenji'],['le toit, le toit','Nour'],['milo t’es où ?','Tom'],['boulangerie svp','Léa'],['😱😱😱','Sacha']];
const TEAMS=[['corbeaux',36],['lucioles',35],['renards',34],['méduses',33]];
const OPTS=['boulangerie','toit','métro'];
const FAM={
 trig:{n:'déclencheurs',s:'quand',ref:'FA—01',v:'--fam-trig',g:'M13 2 4 14h7l-1 8 9-12h-7z'},
 flow:{n:'flux et logique',s:'comment',ref:'FA—02',v:'--fam-flow',g:'M12 3l9 9-9 9-9-9z'},
 data:{n:'données',s:'combien',ref:'FA—03',v:'--fam-data',g:'M5 20v-8M10 20V5M15 20v-6M20 20V9'},
 cible:{n:'ciblage',s:'qui',ref:'FA—04',v:'--fam-cible',g:'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 21c.8-4 3.6-6 7-6s6.2 2 7 6'},
 fx:{n:'effets téléphone',s:'lumière · vibration · son',ref:'FA—05',v:'--fam-fx',g:'M2 12h4l3-7 4 14 3-9 2 2h4'},
 ui:{n:'interfaces joueur',s:'écrans types',ref:'FA—06',v:'--fam-ui',g:'M8 2h8v20H8zM11 18h2'},
 scene:{n:'scène et extérieur',s:'streamer · osc · midi',ref:'FA—07',v:'--fam-scene',g:'M3 8h11v8H3zM14 11l7-3v8l-7-3'},
 gate:{n:'points d’arrêt',s:'attente humaine',ref:'FA—08',v:'--fam-gate',g:'M9 2h6v20H9zM11 6h2v2h-2zM11 11h2v2h-2zM11 16h2v2h-2z'},
 seg:{n:'segment',s:'',ref:'SG',v:'--cy',g:'M3 7h18v10H3zM9 7v10'},
 sub:{n:'sous-graphe',s:'',ref:'SG',v:'--cy',g:'M4 4h7v7H4zM13 13h7v7h-7zM11 7.5h4.5V13'}};
const FAMS=['trig','flow','data','cible','fx','ui','scene','gate'];
const TY={exec:{v:'--exec',sh:'chev',n:'exécution'},num:{v:'--t-num',sh:'o',n:'nombre'},txt:{v:'--t-txt',sh:'o',n:'texte'},bool:{v:'--t-bool',sh:'o',n:'vrai / faux'},cible:{v:'--t-cible',sh:'d',n:'joueurs'},equipe:{v:'--t-cible',sh:'d',n:'équipe'},coul:{v:'--t-coul',sh:'o',n:'couleur'},media:{v:'--t-media',sh:'s',n:'média'}};
const compat=(a,b)=>a===b||(a==='equipe'&&b==='cible');
const SP={};
const pp=a=>(a||[]).map(s=>{const i=s.indexOf(':');return{t:s.slice(0,i),n:s.slice(i+1)}});
function S(k,fam,name,key,ins,outs,sets,pv,desc,w,ph){SP[k]={k,fam,name,key,ins:pp(ins),outs:pp(outs),sets:sets||[],pv:pv,desc,w:w||220,ph:ph||PH}}
S('b1','trig','au démarrage du segment','SG—04',[],['exec:'],[['délai',0,0,10,' s',1]],'start','Se déclenche à l’entrée dans le segment, avant tout autre top.');
S('b2','trig','à +t','+80 S',[],['exec:'],[['décalage',.53,0,150,' s',0]],'timer','Un top minuté après l’entrée dans le segment.');
S('b3','trig','vote reçu','121',[],['exec:','num:votes','cible:votant'],[['regrouper',.2,0,5,' s',1]],'vote','Chaque vote reçu ; en répétition les bots en envoient des dizaines par seconde (agrégés ×N sur le fil).');
S('b4','trig','texte reçu','CHAT',[],['exec:','txt:message','cible:auteur'],[['tampon',.4,0,5,' s',1]],'text','Le dernier message validé par la modération.');
S('b5','trig','secousse','ÉNERGIE',[],['exec:','num:énergie'],[['seuil',.35,0,1,'',1]],'seismo','L’énergie des accéléromètres de la salle, en direct.');
S('b6','trig','bouton régie','F1',[],['exec:'],[['garde',.2,0,5,' s',1]],'btn','Un bouton de la régie lié à ce bloc ; clic sur l’aperçu pour l’essayer.');
S('b7','trig','osc reçu','UDP 53000',[],['exec:','num:valeur'],[['lissage',.2,0,1,'',1]],'osc','Un message OSC ou MIDI venu de la console son ou lumière.');
S('b8','trig','joueur rejoint','+3 · −1',[],['exec:','cible:joueur'],[],'join','Un joueur arrive, revient ou part.');
S('f1','flow','selon','3 CAS',['exec:','txt:valeur'],['exec:boulangerie','exec:toit','exec:métro'],[],'switch','L’aiguillage : la branche active s’éclaire en direct.');
S('f2','flow','attendre','3,0 S',['exec:'],['exec:'],[['durée',.3,0,10,' s',1]],'wait','Latent : le fil sortant reste tireté tant que le bloc attend.');
S('f3','flow','aléatoire pondéré','3 POIDS',['exec:'],['exec:a','exec:b','exec:c'],[['graine',.42,0,99,'',0]],'wheel','Un tirage par poids ; l’aiguille s’arrête sur le résultat.');
S('f4','flow','compteur','PAS 1',['exec:','exec:remise'],['exec:','num:compte'],[['pas',0,1,10,'',0]],'counter','Compte les passages.');
S('f5','flow','attendre que','> 600',['exec:','bool:condition'],['exec:'],[['au plus',.5,0,120,' s',0]],'waituntil','Attend qu’une condition soit vraie, au plus N secondes.');
S('f6','flow','porte','FERMÉE',['exec:','exec:ouvrir','exec:fermer'],['exec:'],[],'lock','Laisse passer ou retient le flux.');
S('d1','data','agréger','GAGNANT',['exec:','num:votes'],['num:total','txt:gagnant'],[['fenêtre',.5,0,30,' s',0]],'histo','Histogramme des votes ; la plus haute barre est couronnée.');
S('d2','data','variable','JAUGE_SALLE',['num:valeur'],['num:valeur','bool:> 600'],[['amorti',.4,0,1,'',1]],'var','Une valeur du spectacle et son historique.');
S('d3','data','tirer au sort','N = 3',['exec:','cible:parmi'],['exec:','cible:élus'],[['nombre',.18,1,12,'',0]],'slot','Tire N joueurs : les avatars défilent puis se figent.');
S('d4','data','classement','TOP 3',['equipe:équipes','num:score'],['txt:premier'],[],'podium','Le podium des équipes.');
S('c1','cible','cible','17',[],['cible:joueurs'],[],'cible','a_voté:"A" - rôle:superviseur');
S('c2','cible','équipes','4 ÉQ.',[],['equipe:équipes'],[],'teams','Couleur + emblème + effectif ; capitaine marqué.');
S('c3','cible','zone / siège','RANGS C–F',[],['cible:zone'],[['rayon',.4,0,1,'',1]],'seats','Le plan de salle ; les zones ciblées s’allument.');
S('c4','cible','sans réponse','17',[],['cible:retardataires'],[],'noresp','Ceux qui n’ont pas encore voté.');
S('x1','fx','couleur','#7D5BD6',['exec:','cible:qui'],['exec:'],[['durée',.25,0,20,' s',1]],'color','Allume les téléphones ciblés d’une couleur pleine.');
S('x2','fx','vague','G → D',['exec:','cible:qui'],['exec:'],[['vitesse',.5,0,4,' s',1]],'wave','Un front de couleur traverse les rangs.');
S('x3','fx','stroboscope','HZ',['exec:','cible:qui'],['exec:'],[['fréquence',.8,0,5,' Hz',1]],'strobe','Limité à 3 Hz (photosensibilité) : au-delà, refusé.');
S('x4','fx','vibrer','BATTEMENT',['exec:','cible:qui'],['exec:'],[['intensité',.7,0,1,'',1]],'vibe','Le motif en créneaux ; repli iPhone : flash + clic.');
S('x5','fx','son','CLOCHE.WAV',['exec:','cible:qui','media:fichier'],['exec:'],[['volume',.75,0,1,'',1]],'sound','Joue un son sur les téléphones ciblés.');
S('x6','fx','message privé','SCELLÉ',['exec:','cible:qui','txt:texte'],['exec:'],[],'msg','Le bandeau tel que le joueur le verra.');
S('u1','ui','vote / choix','3 OPTIONS',['exec:','cible:qui'],['exec:','num:votes'],[['chrono',.6,0,150,' s',0]],'vote_ui','« Où doit-il aller ? » — barres de résultat en direct.');
S('u2','ui','réactions','8 EMOJIS',['exec:'],['num:intensité'],[['combo',.5,0,1,'',1]],'react','Grille d’emojis maison ; jauge collective.');
S('u3','ui','afficher écran','CLAVIER',['exec:','cible:qui'],['exec:'],[],'screen','Pousse un écran type sur les téléphones.');
S('s1','scene','écran scène : animer','POPS',['exec:','txt:texte'],[],[['densité',.5,0,1,'',1]],'stage','Le style de l’écran de scène joue en boucle.',260,112);
S('s2','scene','streamer : consigne','MILO',['exec:','txt:consigne'],['exec:reçu'],[],'stream','Consigne envoyée au streamer ; ambre tant que non reçue.');
S('s3','scene','envoyer osc','/LX/12',['exec:','num:valeur'],[],[['échelle',.5,0,1,'',1]],'oscout','Une façade de console miniature.');
S('g1','gate','point d’arrêt','ARMÉ',['exec:','num:quorum'],['exec:passage','exec:avertir'],[['délai max',.6,0,150,' s',0]],'gate','gate_porte : la règle de passage se lit en une phrase.',240);
S('sub','sub','relancer les retardataires','4 BLOCS',['exec:','cible:qui'],['exec:'],[],'sub','Un sous-graphe replié, réutilisable comme une fonction.',250,100);
S('seg','seg','segment','',['exec:'],['exec:'],[],'seg','',300,118);
S('gatem','gate','gate','',['exec:'],['exec:'],[],'gatem','',150,80);
S('gatem3','gate','gate','',['exec:'],['exec:5A','exec:5B','exec:5C'],[],'gatem','',150,80);

function geo(sp){ if(sp._g) return sp._g; const ph=sp.ph;
 const hin=sp.ins.findIndex(p=>p.t==='exec'&&!p.n), hout=sp.outs.findIndex(p=>p.t==='exec'&&!p.n);
 const L=sp.ins.map((p,i)=>i).filter(i=>i!==hin), R=sp.outs.map((p,i)=>i).filter(i=>i!==hout);
 const nr=Math.max(L.length,R.length), top=HD+8+ph+8;
 const h=top+nr*ROWH+(nr?4:0)+sp.sets.length*SETH+(sp.sets.length?4:0)+6;
 const pin=[],pout=[]; if(hin>=0)pin[hin]={x:0,y:HD/2}; if(hout>=0)pout[hout]={x:sp.w,y:HD/2};
 L.forEach((i,r)=>pin[i]={x:0,y:top+r*ROWH+ROWH/2}); R.forEach((i,r)=>pout[i]={x:sp.w,y:top+r*ROWH+ROWH/2});
 const rows=[]; for(let r=0;r<nr;r++) rows.push({l:L[r]!=null?L[r]:null,r:R[r]!=null?R[r]:null});
 return sp._g={w:sp.w,h,ph,pin,pout,rows,top};
}
function fmt(st,v){const n=st[2]+v*(st[3]-st[2]);return (st[5]?n.toFixed(Math.min(1,st[5])):String(Math.round(n))).replace('.',',')+st[4]}

/* ── graphes de démonstration ── */
function mkLogic(){
 const L=[['b1',0,0],['u1',1,0],['g1',2,0],['f1',3,0],['s2',4,0],['c1',0,1],['b3',1,1],['d1',2,1],['u2',3,1],['x2',4,1],['b4',0,2],['c4',1,2],['x4',2,2],['x6',3,2],['s1',4,2],['b5',0,3],['f4',1,3],['d2',2,3],['s3',3,3],['d4',4,3],['b6',0,4],['f6',1,4],['f2',2,4],['x1',3,4],['c2',4,4],['b2',0,5],['f5',1,5],['f3',2,5],['d3',3,5],['x5',4,5],['b7',0,6],['c3',1,6],['x3',2,6],['b8',3,6],['u3',4,6],['sub',5,2]];
 const blocks=L.map(([id,c,r])=>({id,ty:id,x:c===4?1260:c===5?1640:c*300,y:r*340,p:SP[id].sets.map(s=>s[1])}));
 const W=[['b1',0,'u1',0],['c1',0,'u1',1],['u1',0,'g1',0],['u1',1,'g1',1],['b3',0,'d1',0],['b3',1,'d1',1],['d1',1,'f1',1],['g1',0,'f1',0],['f1',0,'s2',0],['f1',1,'x2',0],['f1',2,'s1',0],['b4',1,'s1',1],['b1',0,'u2',0],['g1',1,'x4',0],['c4',0,'x4',1],['x4',0,'x6',0],['c4',0,'x6',1],['g1',1,'sub',0],['c4',0,'sub',1],['b5',0,'f4',0],['b5',1,'d2',0],['d2',0,'s3',1],['f4',0,'s3',0],['b6',0,'f6',0],['f6',0,'f2',0],['f2',0,'x1',0],['c2',0,'x1',1],['c2',0,'d4',0],['f4',1,'d4',1],['b2',0,'f5',0],['d2',1,'f5',1],['f5',0,'f3',0],['f3',0,'d3',0],['c1',0,'d3',1],['d3',0,'x5',0],['d3',1,'x5',1],['b7',0,'x3',0],['c3',0,'x3',1],['b8',0,'u3',0],['b8',1,'u3',1]];
 const wires=W.map((w,i)=>({id:'w'+i,a:w[0],ai:w[1],b:w[2],bi:w[3]}));
 const frames=[{id:'F1',n:'le vote',x:-30,y:-40,w:1180,h:630},{id:'F2',n:'conséquences',x:1230,y:-40,w:290,h:970},{id:'F3',n:'retardataires',x:-30,y:640,w:1180,h:290},{id:'F4',n:'énergie de salle',x:-30,y:980,w:1550,h:290},{id:'F5',n:'tops régie',x:-30,y:1320,w:1550,h:290},{id:'F6',n:'aléa',x:-30,y:1660,w:1550,h:290},{id:'F7',n:'accueil et lumière',x:-30,y:2000,w:1550,h:290}];
 return {blocks,wires,frames};
}
const SEGS=[['s0','0','hall','ouverte',[.15,.6]],['s1','1','noir · ouverture','fixe 45 s',[.1,.5,.8]],['s2','2','milo se connecte','15 s – 2 min',[.3,.7]],['s3','3','chat ouvert','ouverte',[.2,.4,.9]],['s4','4','le choix','15 s – 90 s',[.1,.55,.88]],['s5A','5A','la boulangerie','60 s – 3 min',[.2,.5]],['s5B','5B','le toit','60 s – 3 min',[.3,.6]],['s5C','5C','le métro','60 s – 3 min',[.25,.75]],['s6','6','rôles secrets','fixe 2 min',[.1,.4,.7]],['s7','7','climax','90 s – 4 min',[.1,.3,.5,.7,.9]],['s8','8','final','ouverte',[.5]]];
function mkMacro(){
 const pos={s0:[0,0],s1:[380,0],s2:[760,0],s3:[1140,0],g34:[1520,30],s4:[1720,0],g45:[2100,0],s5A:[2310,-280],s5B:[2310,0],s5C:[2310,280],g56:[2700,30],s6:[2900,0],s7:[3280,0],s8:[3660,0]};
 const blocks=SEGS.map(s=>({id:s[0],ty:'seg',x:pos[s[0]][0],y:pos[s[0]][1],p:[],seg:{n:s[1],name:s[2],dur:s[3],tops:s[4]}}));
 blocks.push({id:'g34',ty:'gatem',x:pos.g34[0],y:pos.g34[1],p:[],gate:{name:'gate_chat',st:'PASSAGE'}});
 blocks.push({id:'g45',ty:'gatem3',x:pos.g45[0],y:pos.g45[1],p:[],gate:{name:'gate_porte',st:'ARMÉ'}});
 blocks.push({id:'g56',ty:'gatem',x:pos.g56[0],y:pos.g56[1],p:[],gate:{name:'gate_retour',st:'EN COURS'}});
 const W=[['s0',0,'s1',0],['s1',0,'s2',0],['s2',0,'s3',0],['s3',0,'g34',0],['g34',0,'s4',0],['s4',0,'g45',0],['g45',0,'s5A',0],['g45',1,'s5B',0],['g45',2,'s5C',0],['s5A',0,'g56',0],['s5B',0,'g56',0],['s5C',0,'g56',0],['g56',0,'s6',0],['s6',0,'s7',0],['s7',0,'s8',0]];
 return {blocks,wires:W.map((w,i)=>({id:'m'+i,a:w[0],ai:w[1],b:w[2],bi:w[3]})),frames:[{id:'A1',n:'acte 1',x:-30,y:-50,w:1500,h:250},{id:'A2',n:'acte 2',x:1490,y:-330,w:1160,h:820},{id:'A3',n:'acte 3',x:2870,y:-50,w:1120,h:250}]};
}
const SEQS={s4:[['b1','u1','g1','f1','s2'],['b3','d1','f1'],['b5','f4','s3'],['b6','f6','f2','x1'],['b4','s1'],['b2','f5','f3','d3','x5'],['b7','x3'],['b8','u3'],['g1','x4','x6','sub']]};
const PATH=['s0','s1','s2','s3','g34','s4','g45','s5A','g56','s6','s7','s8'];

/* ── dessin ── */
const F={m:(s,w)=>`${w||500} ${s}px "Azeret Mono", ui-monospace, monospace`,d:s=>`${s}px "Venus Rising", "Chakra Petch", sans-serif`,u:(s,w)=>`${w||600} ${s}px "Chakra Petch", sans-serif`};
function tx(c,s,x,y,font,col,al,ls){c.font=font;c.fillStyle=col;c.textAlign=al||'left';c.textBaseline='middle';try{c.letterSpacing=ls||'0px'}catch(e){}c.fillText(s,x,y);try{c.letterSpacing='0px'}catch(e){}}
function fr(c,x,y,w,h,col){c.fillStyle=col;c.fillRect(x,y,w,h)}
function sr(c,x,y,w,h,col,lw){c.strokeStyle=col;c.lineWidth=lw||1;c.strokeRect(x+.5,y+.5,w-1,h-1)}
function dot(c,x,y,r,col){c.fillStyle=col;c.beginPath();c.arc(x,y,r,0,7);c.fill()}
function ring(c,x,y,r,f,col,bg,lw){c.lineWidth=lw;c.lineCap='butt';c.strokeStyle=bg;c.beginPath();c.arc(x,y,r,0,7);c.stroke();c.strokeStyle=col;c.beginPath();c.arc(x,y,r,-Math.PI/2,-Math.PI/2+Math.max(0,Math.min(1,f))*Math.PI*2);c.stroke()}
function av(c,x,y,s,i,C,grey){fr(c,x-1,y-1,s+2,s+2,C['--bg']);fr(c,x,y,s,s,grey?C['--panel3']:C['--pseudo-'+(i%12+1)]);tx(c,PSEUDOS[i%12][0].toUpperCase(),x+s/2,y+s/2+.5,F.u(s*.48,700),grey?C['--ink3']:C['--titre-sombre'],'center')}
function emb(c,k,x,y,r,col){c.fillStyle=col;c.beginPath();if(k===0){c.moveTo(x,y-r);c.lineTo(x+r,y+r*.8);c.lineTo(x-r,y+r*.8)}else if(k===1){c.arc(x,y,r,0,7)}else if(k===2){c.rect(x-r*.85,y-r*.85,r*1.7,r*1.7)}else{c.moveTo(x,y-r);c.lineTo(x+r,y);c.lineTo(x,y+r);c.lineTo(x-r,y)}c.closePath();c.fill()}
const SEG7=[0x3f,0x06,0x5b,0x4f,0x66,0x6d,0x7d,0x07,0x7f,0x6f];
function seg7(c,x,y,w,h,d,on,off){const t=Math.max(2,w*.17),hh=h/2;[[t,0,w-2*t,t],[w-t,t,t,hh-t*1.5],[w-t,hh+t*.5,t,hh-t*1.5],[t,h-t,w-2*t,t],[0,hh+t*.5,t,hh-t*1.5],[0,t,t,hh-t*1.5],[t,hh-t/2,w-2*t,t]].forEach((r,i)=>fr(c,x+r[0],y+r[1],r[2],r[3],(SEG7[d]>>i)&1?on:off))}
function seats(c,cx,cy,C,fn){fr(c,cx-34,cy-4,68,3,C['--ink3']);for(let r=0;r<5;r++){const R=14+r*9,n=9+r*3;for(let i=0;i<n;i++){const a=Math.PI*(.12+.76*i/(n-1));fr(c,cx+Math.cos(a)*R*1.7-1.5,cy+Math.sin(a)*R-1.5,3,3,fn(r,i,a)||C['--panel3'])}}}
function phone(c,x,y,w,h,C,inner){fr(c,x,y,w,h,C['--salle-noir']);sr(c,x,y,w,h,C['--line']);c.save();c.beginPath();c.rect(x+2,y+2,w-4,h-4);c.clip();inner&&inner(x+2,y+2,w-4,h-4);c.restore();fr(c,x+w*.38,y+3,w*.24,1.5,C['--ink3'])}
function wave(c,x,y,w,h,C,t,ph){const n=Math.floor(w/1.5);for(let i=0;i<n;i++){const u=i/n;const a=(Math.abs(Math.sin(u*31+1.3))*.5+Math.abs(Math.sin(u*7.3))*.5)*Math.exp(-Math.pow((u-.25)*3,2)*.6+.0)*(.55+.45*Math.sin(u*90));const v=Math.min(1,Math.abs(a));const col=v>.8?C['--spec-4']:v>.6?C['--spec-3']:v>.3?C['--spec-2']:C['--spec-1'];fr(c,x+i*1.5,y+h/2-v*h/2,1.5,Math.max(1,v*h),col)}if(ph!=null)fr(c,x+ph*w-1,y-2,2,h+4,C['--or'])}

const D={};
D.start=(c,w,h,t,C,S,o)=>{const n=9,g=2,cw=(w-24-g*(n-1))/n;for(let i=0;i<n;i++){const x=12+i*(cw+g);fr(c,x,32,cw,18,i===4?C['--panel3']:C['--panel2']);if(i<4)fr(c,x,48,cw,2,C['--grn2']);tx(c,i===5?'5':String(i),x+cw/2,41,F.m(7),i===4?C['--ink']:C['--ink3'],'center')}
 const x4=12+4*(cw+g),p=o.run?1:(Math.sin(t*2.4)+1)/2;c.globalAlpha=.3+.7*p;fr(c,x4-2,27,3,28,o.run?C['--grn2']:o.k);c.globalAlpha=1;
 tx(c,'ENTRÉE · SG—04',12,14,F.m(7),C['--ink3'],'left','1px');tx(c,'4 le choix',12,72,F.u(11,500),C['--ink2']);tx(c,o.run?'S’EXÉCUTE':'PRÊT',w-12,72,F.m(7),o.run?C['--grn2']:C['--ink3'],'right','1px')};
D.timer=(c,w,h,t,C,S,o)=>{const y=26,L=12,W=w-24;fr(c,L,y,W,1,C['--line']);for(let i=0;i<=15;i++){const x=L+i*W/15;fr(c,x,y-(i%5?3:7),1,i%5?3:7,C['--ink3'])}
 const T=o.p?(o.p[0]*150):80,el=S.el%150,mx=L+(T/150)*W;fr(c,mx-1,y-12,2,18,o.k);tx(c,'+'+Math.round(T)+' S',mx,y+14,F.m(7),o.k,'center','1px');const ph=L+(el/150)*W;fr(c,ph-1,y-13,2,19,C['--or']);
 const rem=Math.max(0,T-el);tx(c,'00:'+String(Math.floor(rem)).padStart(2,'0'),w/2,h-24,F.d(20),C['--cy'],'center','2px')};
D.vote=(c,w,h,t,C,S,o)=>{const ux=18,uy=36;sr(c,ux,uy,46,40,o.k,1.5);fr(c,ux+12,uy-1,22,3,C['--bg']);const ph=(t*1.2)%1;if(ph<.7){c.globalAlpha=1-ph;fr(c,ux+18,uy-24+ph*30,10,7,C['--ink2']);c.globalAlpha=1}
 tx(c,String(S.voted),w-14,44,F.d(28),C['--cy'],'right','1px');tx(c,'VOTES REÇUS',w-14,70,F.m(7),C['--ink3'],'right','1px');
 const sp=t-S.lastVote;if(sp<.4){c.strokeStyle=C['--grn2'];c.lineWidth=1.2;c.globalAlpha=1-sp/.4;for(let i=0;i<6;i++){const a=i*1.047+t;const r0=20+sp*30;c.beginPath();c.moveTo(w-50+Math.cos(a)*r0,44+Math.sin(a)*r0*.6);c.lineTo(w-50+Math.cos(a)*(r0+5),44+Math.sin(a)*(r0+5)*.6);c.stroke()}c.globalAlpha=1}};
D.text=(c,w,h,t,C,S,o)=>{const m=MSGS[S.msgI%MSGS.length];fr(c,12,16,w-24,40,C['--panel2']);c.fillStyle=C['--panel2'];c.beginPath();c.moveTo(22,56);c.lineTo(32,56);c.lineTo(22,64);c.fill();
 const ch=Math.min(m[0].length,Math.floor((t-S.msgT)*22));tx(c,m[0].slice(0,ch)+((t*2)%1<.5&&ch<m[0].length?'▌':''),20,36,F.u(12,500),C['--ink']);
 tx(c,'— '+m[1],34,70,F.m(7.5),o.k,'left','1px');tx(c,S.rate+' / MIN',w-14,70,F.m(7.5),C['--ink3'],'right','1px')};
D.seismo=(c,w,h,t,C,S,o)=>{const mid=h/2+4;for(let i=0;i<=6;i++)fr(c,10+i*(w-20)/6,16,1,h-24,C['--dot']);fr(c,10,mid,w-20,1,C['--line']);
 c.beginPath();const n=S.en.length;for(let i=0;i<n;i++){const x=10+i*(w-20)/(n-1),y=mid-S.en[i]*(h*.36);i?c.lineTo(x,y):c.moveTo(x,y)}c.strokeStyle=o.k;c.lineWidth=1.3;c.stroke();
 tx(c,'ÉNERGIE',12,10,F.m(7),C['--ink3'],'left','1px');tx(c,String(Math.round(S.energy*100)),w-12,10,F.m(8,600),C['--cy'],'right','1px')};
D.btn=(c,w,h,t,C,S,o)=>{const fl=Math.max(0,1-(t-S.btnT)*2.2);fr(c,22,24,w-44,34,fl>0?C['--or']:C['--panel2']);sr(c,22,24,w-44,34,C['--line']);if(fl>0){c.globalAlpha=fl*.6;sr(c,22-fl*6,24-fl*6,w-44+fl*12,34+fl*12,C['--or'],1.5);c.globalAlpha=1}
 tx(c,'RÉVÉLER LE TRAÎTRE',w/2,41,F.u(10,600),fl>.3?C['--on-or']:C['--ink'],'center','1px');tx(c,'F1 · CLIC POUR ESSAYER',w/2,76,F.m(7),C['--ink3'],'center','1px')};
D.osc=(c,w,h,t,C,S,o)=>{const on=(t*2.7)%1<.18;dot(c,20,18,4.5,on?C['--grn2']:C['--panel3']);tx(c,'/qlab/cue/12',32,18,F.m(9),C['--ink'],'left','.5px');tx(c,'UDP 53000',12,36,F.m(7),C['--ink3'],'left','1px');
 const n=26,bw=(w-24)/n;for(let i=0;i<n;i++){const v=(Math.sin(i*.6+t*2.2)+1)/2*.8+.1;fr(c,12+i*bw,h-10-v*34,bw-1.5,v*34,i===n-1?o.k:C['--panel3'])}};
D.join=(c,w,h,t,C,S,o)=>{const k=Math.floor(t/1.6);for(let i=0;i<6;i++)av(c,14+i*15,24,20,(i+k)%12,C);const ph=(t%1.6)/1.6;c.globalAlpha=1-ph;tx(c,'↘',18+6*15+6,20-ph*8,F.u(12),C['--grn2']);c.globalAlpha=1;
 tx(c,'+3',w-46,34,F.d(13),C['--grn2'],'right');tx(c,'−1',w-12,34,F.d(13),C['--amb'],'right');tx(c,'138 PRÉSENTS · 4 PARTIS',12,72,F.m(7),C['--ink3'],'left','1px')};
D.switch=(c,w,h,t,C,S,o)=>{const act=o.run||o.live?S.win:-1;OPTS.forEach((n,i)=>{const y=12+i*24,on=i===act;fr(c,12,y,w-24,19,on?C['--panel3']:C['--panel2']);fr(c,12,y,2,19,on?C['--grn2']:o.k);tx(c,n,22,y+10,F.u(10.5,on?600:500),on?C['--ink']:C['--ink3']);tx(c,String(S.votes[i]),w-18,y+10,F.m(8,600),on?C['--grn2']:C['--ink3'],'right')})};
D.wait=(c,w,h,t,C,S,o)=>{const dur=Math.max(.1,(o.p&&o.p[0]!=null?o.p[0]:.3)*10);const f=o.run?1-((t)%dur)/dur:1;ring(c,46,h/2,26,f,o.k,C['--panel3'],4);tx(c,(dur*f).toFixed(1).replace('.',','),46,h/2-2,F.u(13,700),C['--cy'],'center');tx(c,'S',46,h/2+11,F.m(7),C['--ink3'],'center');
 tx(c,'LATENT',92,h/2-9,F.m(7),C['--ink3'],'left','1px');tx(c,o.run?'attend…':'au repos',92,h/2+8,F.u(11,500),o.run?C['--amb']:C['--ink2'])};
D.waituntil=(c,w,h,t,C,S,o)=>{const ok=S.jauge>600;tx(c,'jauge_salle',14,22,F.m(9),C['--cy']);tx(c,'> 600',14,44,F.d(16),C['--ink']);const fx=w-34;fr(c,fx,12,22,60,C['--panel2']);dot(c,fx+11,28,6.5,ok?C['--panel3']:C['--amb']);dot(c,fx+11,56,6.5,ok?C['--grn2']:C['--panel3']);
 tx(c,ok?'VRAI · PASSE':'ATTEND · '+Math.round(S.jauge),14,72,F.m(7),ok?C['--grn2']:C['--amb'],'left','1px')};
D.wheel=(c,w,h,t,C,S,o)=>{const ws=[.5,.3,.2],cols=[o.k,C['--cy'],C['--coral-3']],cx=48,cy=h/2,r=33;let a=-Math.PI/2;ws.forEach((p,i)=>{c.beginPath();c.moveTo(cx,cy);c.arc(cx,cy,r,a,a+p*6.283);c.closePath();c.fillStyle=cols[i];c.fill();a+=p*6.283});
 c.strokeStyle=C['--bg'];c.lineWidth=1.5;a=-Math.PI/2;ws.forEach(p=>{c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);c.stroke();a+=p*6.283});
 const ph=(t%4.5)/4.5,e=Math.min(1,ph/.7),ang=-Math.PI/2+(1-Math.pow(1-e,3))*(6.283*3+2.1);c.strokeStyle=C['--ink'];c.lineWidth=2;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(ang)*(r+5),cy+Math.sin(ang)*(r+5));c.stroke();fr(c,cx-3,cy-3,6,6,C['--ink']);
 ['A · 50 %','B · 30 %','C · 20 %'].forEach((s,i)=>{fr(c,98,22+i*18,8,8,cols[i]);tx(c,s,112,26+i*18,F.m(8),e>=1&&i===1?C['--ink']:C['--ink2'],'left','1px')})};
D.counter=(c,w,h,t,C,S,o)=>{const s=String(S.counter%10000).padStart(4,'0');const dw=30,gap=8,x0=(w-(4*dw+3*gap))/2;for(let i=0;i<4;i++)seg7(c,x0+i*(dw+gap),18,dw,52,+s[i],C['--cy'],C['--panel2']);tx(c,'PASSAGES',w/2,82,F.m(7),C['--ink3'],'center','1px')};
D.lock=(c,w,h,t,C,S,o)=>{const open=S.lockOpen;const x=w/2-18,y=40;c.strokeStyle=open?C['--grn2']:o.k;c.lineWidth=4;c.beginPath();c.moveTo(x+8,y);c.lineTo(x+8,y-12);c.lineTo(x+28,y-12);c.lineTo(x+28,open?y-20:y);c.stroke();fr(c,x,y,36,28,open?C['--grn2']:o.k);fr(c,x+16,y+9,4,10,C['--bg']);tx(c,open?'OUVERTE':'FERMÉE',w/2,84,F.m(7.5),open?C['--grn2']:C['--ink3'],'center','1px')};
D.histo=(c,w,h,t,C,S,o)=>{const mx=Math.max(...S.votes),bw=(w-48)/3;S.votes.forEach((v,i)=>{const bh=(v/80)*(h-36),x=16+i*(bw+8),y=h-16-bh;fr(c,x,y,bw,bh,v===mx?C['--cy']:C['--panel3']);tx(c,String(v),x+bw/2,y-7,F.m(8,600),v===mx?C['--cy']:C['--ink3'],'center');tx(c,OPTS[i].slice(0,5).toUpperCase(),x+bw/2,h-7,F.m(6.5),C['--ink3'],'center','.5px');
 if(v===mx){c.fillStyle=C['--amb'];c.beginPath();const cx=x+bw/2,cy=y-19;c.moveTo(cx-7,cy+4);c.lineTo(cx-7,cy-3);c.lineTo(cx-3.5,cy+1);c.lineTo(cx,cy-5);c.lineTo(cx+3.5,cy+1);c.lineTo(cx+7,cy-3);c.lineTo(cx+7,cy+4);c.fill()}})};
D.var=(c,w,h,t,C,S,o)=>{tx(c,'jauge_salle',12,14,F.m(8),C['--ink3']);tx(c,String(Math.round(S.jauge)),12,40,F.d(24),C['--cy'],'left','1px');const n=S.jh.length,x0=12,W=w-24,y0=h-10,H=30;fr(c,x0,y0-H*(600/1000),W,1,C['--amb']);
 c.beginPath();S.jh.forEach((v,i)=>{const x=x0+i*W/(n-1),y=y0-(v/1000)*H;i?c.lineTo(x,y):c.moveTo(x,y)});c.strokeStyle=o.k;c.lineWidth=1.4;c.stroke();tx(c,'600',w-12,y0-H*.6-6,F.m(6.5),C['--amb'],'right')};
D.slot=(c,w,h,t,C,S,o)=>{const ph=(t%3)/3,stop=ph>.6;for(let col=0;col<3;col++){const x=24+col*((w-48)/3)+((w-48)/3-36)/2;fr(c,x-3,14,42,64,C['--panel2']);c.save();c.beginPath();c.rect(x-3,14,42,64);c.clip();const off=stop?0:((t*(8+col*2))%1)*40;for(let k=-1;k<2;k++)av(c,x+3,26+k*40+off,30,(col*3+k+(stop?7:Math.floor(t*(8+col*2))))%12,C);c.restore();if(stop)sr(c,x-3,14,42,64,C['--grn2'],1.5)}
 tx(c,stop?'3 ÉLUS':'TIRAGE…',w/2,86,F.m(7),stop?C['--grn2']:C['--ink3'],'center','1px')};
D.podium=(c,w,h,t,C,S,o)=>{const ord=[1,0,2],hs=[44,58,32];ord.forEach((ti,i)=>{const x=24+i*((w-48)/3),bw=(w-48)/3-8,bh=hs[i],y=h-12-bh;fr(c,x,y,bw,bh,i===1?C['--panel3']:C['--panel2']);emb(c,ti,x+bw/2,y-12,6,C['--eq-'+(ti+1)]);tx(c,String(i===1?1:i===0?2:3),x+bw/2,y+14,F.d(13),i===1?C['--cy']:C['--ink3'],'center');tx(c,TEAMS[ti][0].slice(0,7).toUpperCase(),x+bw/2,h-20,F.m(6),C['--ink3'],'center','.5px')})};
D.cible=(c,w,h,t,C,S,o)=>{for(let i=0;i<7;i++)av(c,12+i*13,14,20,i+2,C);tx(c,'17',w-12,24,F.d(22),C['--ink'],'right');[0,1].forEach(i=>{fr(c,12+i*58,46,52,14,C['--panel2']);emb(c,i,20+i*58,53,4,C['--eq-'+(i+1)]);tx(c,TEAMS[i][0].slice(0,6),28+i*58,53,F.m(7),C['--ink2'])});tx(c,'a_voté:"A" - rôle:superv.',12,76,F.m(7),o.k,'left','.3px')};
D.teams=(c,w,h,t,C,S,o)=>{TEAMS.forEach((tm,i)=>{const y=10+i*19;fr(c,12,y,w-24,16,C['--panel2']);fr(c,12,y,3,16,C['--eq-'+(i+1)]);emb(c,i,26,y+8,4.5,C['--eq-'+(i+1)]);tx(c,tm[0],36,y+8,F.u(10,500),C['--ink']);if(i===0)tx(c,'★ CAP.',w-50,y+8,F.m(6.5),C['--amb'],'right');tx(c,String(tm[1]),w-18,y+8,F.m(8,600),C['--cy'],'right')})};
D.seats=(c,w,h,t,C,S,o)=>{const rad=o.p?o.p[0]:.4;seats(c,w/2,14,C,(r,i)=>r>=1&&r<=1+Math.round(rad*4)?o.k:null);tx(c,'SCÈNE',w/2,7,F.m(6),C['--ink3'],'center','1px');tx(c,'RANGS C–F · 46 SIÈGES',w/2,h-6,F.m(6.5),C['--ink3'],'center','1px')};
D.noresp=(c,w,h,t,C,S,o)=>{for(let i=0;i<8;i++)av(c,12+i*14,18,20,i+4,C,true);const n=S.total-S.voted;tx(c,String(n),w-12,28,F.d(22),n?C['--amb']:C['--grn2'],'right');tx(c,n?'N’ONT PAS VOTÉ':'TOUT LE MONDE A VOTÉ',12,58,F.m(7),n?C['--amb']:C['--grn2'],'left','1px');fr(c,12,70,w-24,4,C['--panel3']);fr(c,12,70,(w-24)*S.voted/S.total,4,C['--grn2'])};
D.color=(c,w,h,t,C,S,o)=>{const col='#7d5bd6';fr(c,12,12,w-84,h-24,col);tx(c,'#7D5BD6',18,h-20,F.m(8,600),C['--titre-clair'],'left','1px');phone(c,w-58,8,34,h-16,C,(x,y,W,H)=>{const p=(Math.sin(t*2)+1)/2;c.globalAlpha=.55+.45*p;fr(c,x,y,W,H,col);c.globalAlpha=1})};
D.wave=(c,w,h,t,C,S,o)=>{const fx=((t*.45)%1.3)-.15;seats(c,w/2,14,C,(r,i,a)=>{const u=1-(a-Math.PI*.12)/(Math.PI*.76);const d=Math.abs(u-fx);return d<.08?o.k:d<.18?C['--coral-1']:null});tx(c,'SCÈNE',w/2,7,F.m(6),C['--ink3'],'center','1px');tx(c,'GAUCHE → DROITE',w/2,h-6,F.m(6.5),C['--ink3'],'center','1px')};
D.strobe=(c,w,h,t,C,S,o)=>{const hz=(o.p?o.p[0]:.8)*5,ok=hz<=3,on=ok&&((t*hz)%1<.5);for(let y=0;y<4;y++)for(let x=0;x<4;x++)fr(c,12+x*13,12+y*13,12,12,((x+y)%2===0)===on?C['--ink']:C['--panel3']);
 const gx=74,gw=w-86;fr(c,gx,30,gw,6,C['--panel3']);fr(c,gx,30,gw*Math.min(1,hz/5),6,ok?o.k:C['--amb']);fr(c,gx+gw*.6-1,24,2,18,C['--rouge']);tx(c,'3 HZ',gx+gw*.6,18,F.m(6.5),C['--rouge'],'center','1px');tx(c,hz.toFixed(1).replace('.',',')+' HZ',gx,52,F.u(13,700),ok?C['--cy']:C['--amb']);tx(c,ok?'sous la limite':'refusé : > 3 flashs/s',gx,70,F.u(9.5,500),ok?C['--ink3']:C['--amb'])};
D.vibe=(c,w,h,t,C,S,o)=>{const pat=[1,0,1,0,0,1,1,0,1,0,0,0,1,0,1,0,0,1,1,0];const sw=(w-24)/pat.length,base=46;c.beginPath();c.moveTo(12,base);pat.forEach((p,i)=>{const x=12+i*sw;c.lineTo(x,base-(p?24:0));c.lineTo(x+sw,base-(p?24:0))});c.strokeStyle=o.k;c.lineWidth=1.5;c.stroke();const ph=(t*.5)%1;fr(c,12+ph*(w-24),16,2,34,C['--or']);
 for(let i=0;i<5;i++)fr(c,12+i*(w-24)/4,base+4,1,4,C['--ink3']);tx(c,'0 MS',12,base+14,F.m(6.5),C['--ink3']);tx(c,'1 200 MS',w-12,base+14,F.m(6.5),C['--ink3'],'right');tx(c,'iOS : flash + clic',12,h-10,F.u(9.5,500),S.vibeFix?C['--grn2']:C['--amb'])};
D.sound=(c,w,h,t,C,S,o)=>{wave(c,12,14,w-24,44,C,t,(t*.3)%1);tx(c,'CLOCHE.WAV · 0:04',12,70,F.m(7),C['--ink3'],'left','1px');tx(c,'38 SANS SON',w-12,70,F.m(7,600),C['--amb'],'right','1px');fr(c,12,82,w-24,3,C['--panel3']);fr(c,12,82,(w-24)*(o.p?o.p[0]:.75),3,o.k)};
D.msg=(c,w,h,t,C,S,o)=>{phone(c,12,6,44,h-12,C,(x,y,W,H)=>{fr(c,x,y,W,H,C['--bg']);const sl=Math.min(1,((t%4)/1.2));fr(c,x+2,y+6-14*(1-sl),W-4,14,C['--panel3']);fr(c,x+2,y+6-14*(1-sl),2,14,o.k)});
 const ex=70,ey=20,ew=w-84,eh=44;sr(c,ex,ey,ew,eh,o.k,1.5);c.strokeStyle=o.k;c.beginPath();c.moveTo(ex,ey);c.lineTo(ex+ew/2,ey+eh*.55);c.lineTo(ex+ew,ey);c.stroke();fr(c,ex+ew/2-5,ey+eh*.55-5,10,10,C['--or']);tx(c,'garde-le pour toi',ex,ey+eh+14,F.u(9.5,500),C['--ink2'])};
D.vote_ui=(c,w,h,t,C,S,o)=>{const tot=S.voted;OPTS.forEach((n,i)=>{const y=10+i*22,f=S.votes[i]/tot;fr(c,12,y,w-70,18,C['--panel2']);fr(c,12,y,(w-70)*f,18,i===S.win?C['--grn']:C['--panel3']);tx(c,n,18,y+9,F.u(9.5,500),C['--ink']);tx(c,Math.round(f*100)+' %',w-62,y+9,F.m(7.5,600),C['--cy'],'right')});
 const rem=S.remain/90;ring(c,w-28,40,17,rem,S.remain<=10?C['--amb']:o.k,C['--panel3'],3);tx(c,'0:'+String(Math.ceil(S.remain)).padStart(2,'0'),w-28,40,F.m(7.5,600),C['--ink'],'center');tx(c,'« où doit-il aller ? »',12,h-8,F.u(9.5,500),C['--ink3'])};
D.react=(c,w,h,t,C,S,o)=>{const em=['🔥','😱','😂','❤️','👏','🫣','⚡','🐀'];em.forEach((e,i)=>{const x=10+(i%4)*36,y=8+Math.floor(i/4)*38,p=(Math.sin(t*3+i*1.7)+1)/2;fr(c,x,y,32,34,C['--panel2']);c.font=`${14+p*3}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(e,x+16,y+13);tx(c,String(Math.round(40+i*13+p*9)),x+16,y+28,F.m(6.5,600),C['--ink3'],'center')});
 const tx0=w-22;fr(c,tx0,8,10,h-16,C['--panel3']);const lv=(Math.sin(t*.8)+1)/2*.6+.3;fr(c,tx0,8+(h-16)*(1-lv),10,(h-16)*lv,o.k)};
D.screen=(c,w,h,t,C,S,o)=>{phone(c,w/2-24,4,48,h-8,C,(x,y,W,H)=>{fr(c,x,y,W,H,C['--bg']);fr(c,x+2,y+6,W-4,8,C['--panel3']);fr(c,x+2,y+H-30,W-4,6,C['--panel2']);for(let r=0;r<3;r++)for(let k=0;k<7;k++)fr(c,x+2+k*((W-4)/7),y+H-22+r*7,(W-4)/7-1,5,C['--panel3']);if((t*1.5)%1<.5)fr(c,x+4,y+H-29,1,4,C['--ink'])});tx(c,'VOTE',14,24,F.m(7),C['--ink3'],'left','1px');tx(c,'CLAVIER',14,40,F.m(7,600),o.k,'left','1px');tx(c,'ATTENTE',14,56,F.m(7),C['--ink3'],'left','1px')};
D.stage=(c,w,h,t,C,S,o)=>{fr(c,0,0,w,h,C['--salle-noir']);for(let i=0;i<4;i++){const y=14+i*18,sp=40+i*13,x=w-((t*sp+i*80)%(w+120));tx(c,MSGS[(i+S.msgI)%MSGS.length][0],x,y,F.u(10,600),C['--titre-clair'])}
 const dens=o.p?o.p[0]:.5;for(let k=0;k<Math.round(3+dens*5);k++){const ph=((t*.5+k*.27)%1),x=24+((k*53)%(w-48)),y=h-12-ph*60,r=4+ph*9;c.globalAlpha=1-ph;dot(c,x,y,r,C['--pseudo-'+(k%12+1)]);c.globalAlpha=1}
 fr(c,8,h-18,52,11,C['--rouge']);tx(c,'EN DIRECT',34,h-12.5,F.m(6,600),C['--on-rouge'],'center','.8px')};
D.stream=(c,w,h,t,C,S,o)=>{fr(c,10,8,w-20,h-16,C['--panel3']);for(let i=0;i<40;i++)fr(c,10+((i*37)%(w-20)),8+((i*53)%(h-16)),2,2,C['--dot-hi']);const rec=S.recu;fr(c,10,8,w-20,28,rec?C['--veil']:C['--amb']);tx(c,'VA VERS LA BOULANGERIE',w/2,22,F.d(8.5),rec?C['--ink']:C['--on-amb'],'center','.5px');
 fr(c,w/2-34,h-30,68,16,rec?C['--grn']:C['--panel2']);tx(c,rec?'REÇU ✓':'ENVOYÉE',w/2,h-22,F.m(7,600),rec?C['--on-grn']:C['--amb'],'center','1px');tx(c,'24 I/S · 180 MS',w-14,h-40,F.m(6,500),C['--cy'],'right')};
D.oscout=(c,w,h,t,C,S,o)=>{const v=Math.max(0,Math.min(1,S.jauge/1000*(o.p?o.p[0]*2:1)));const fx=26,fy=12,fh=h-24;fr(c,fx-4,fy,8,fh,C['--panel3']);fr(c,fx-1,fy+4,2,fh-8,C['--line']);fr(c,fx-10,fy+fh*(1-v)-5,20,10,C['--ink']);fr(c,fx-10,fy+fh*(1-v)-.5,20,1,C['--ink3']);
 tx(c,'/lx/12',52,24,F.m(9),C['--ink'],'left','.5px');tx(c,v.toFixed(2).replace('.',','),52,52,F.d(20),C['--cy'],'left','1px');tx(c,'→ CONSOLE LUMIÈRE',52,74,F.m(6.5),C['--ink3'],'left','1px')};
function feu(c,x,y,st,C,t,s){s=s||1;fr(c,x,y,22*s,62*s,C['--panel2']);const pulse=(Math.sin(t*4.5)+1)/2;const L=[[st==='RETENU'?C['--rouge']:C['--panel3'],1],[st==='ARMÉ'||st==='AVERTISSEMENT'?C['--amb']:C['--panel3'],st==='AVERTISSEMENT'?.35+.65*pulse:1],[st==='PASSAGE'?C['--grn2']:C['--panel3'],1]];L.forEach((l,i)=>{c.globalAlpha=l[1];dot(c,x+11*s,y+(12+i*19)*s,6.5*s,l[0]);c.globalAlpha=1})}
D.gate=(c,w,h,t,C,S,o)=>{const st=o.gst||'ARMÉ';feu(c,12,14,st,C,t);tx(c,st,44,20,F.m(8,600),st==='PASSAGE'?C['--grn2']:st==='RETENU'?C['--rouge']:C['--amb'],'left','1px');const q=S.voted/S.total;fr(c,44,36,w-104,5,C['--panel3']);fr(c,44,36,(w-104)*q,5,C['--grn2']);
 tx(c,S.voted+'/'+S.total+' — '+Math.round(q*100)+' %',44,52,F.m(7.5,600),C['--cy'],'left','.5px');tx(c,'100 % ou délai',44,68,F.u(9.5,500),C['--ink3']);ring(c,w-28,44,19,S.remain/90,S.remain<=10?C['--amb']:C['--cy'],C['--panel3'],3);tx(c,'0:'+String(Math.ceil(S.remain)).padStart(2,'0'),w-28,44,F.m(8,600),C['--ink'],'center')};
D.sub=(c,w,h,t,C,S,o)=>{const cells=['noresp','vibe','msg','wait'],cw=(w-6)/2,ch=(h-6)/2;cells.forEach((k,i)=>{const x=2+(i%2)*(cw+2),y=2+Math.floor(i/2)*(ch+2);c.save();c.translate(x,y);c.beginPath();c.rect(0,0,cw,ch);c.clip();c.scale(cw/202,ch/90);fr(c,0,0,202,90,C['--bg']);D[k](c,202,90,t,C,S,{k:C[FAM[['cible','fx','fx','flow'][i]].v],p:null});c.restore();sr(c,x,y,cw,ch,C['--line'])})};
D.seg=(c,w,h,t,C,S,o)=>{const b=o.b,sg=b.seg;fr(c,10,10,w-20,14,C['--panel2']);(sg.tops||[]).forEach(u=>{fr(c,10+u*(w-20)-1,7,2,20,C['--coral-2']);fr(c,10+u*(w-20)-3,7,6,4,C['--coral-2'])});if(o.cur){const ph=(S.el%90)/90;fr(c,10+ph*(w-20)-1,4,2,24,C['--or'])}
 const ty=34,th=h-ty-8;phone(c,10,ty,th*.47,th,C,(x,y,W,H)=>{fr(c,x,y,W,H,C['--bg']);if(sg.n==='4'){for(let i=0;i<3;i++)fr(c,x+3,y+H*.35+i*10,W-6,7,i===S.win&&o.cur?C['--grn']:C['--panel3'])}else{const p=(Math.sin(t*1.5+sg.n.length)+1)/2;c.globalAlpha=.3+.4*p;dot(c,x+W/2,y+H/2,3,C['--cy']);c.globalAlpha=1}});
 const sx=10+th*.47+8;phone(c,sx,ty,th*.47,th,C,(x,y,W,H)=>{fr(c,x,y,W,H,C['--panel3']);fr(c,x,y+4,W,8,C['--amb'])});const scx=sx+th*.47+8,scw=w-scx-10,sch=Math.min(th,scw*9/16);fr(c,scx,ty,scw,sch,C['--salle-noir']);sr(c,scx,ty,scw,sch,C['--line']);
 for(let k=0;k<4;k++){const ph=((t*.4+k*.3+sg.n.length*.1)%1);c.globalAlpha=1-ph;dot(c,scx+10+((k*37)%(scw-20)),ty+sch-6-ph*(sch-14),2+ph*4,C['--pseudo-'+(k*3%12+1)]);c.globalAlpha=1}
 tx(c,'TÉL.',10,h-1,F.m(5.5),C['--ink3'],'left');tx(c,'STREAM',sx,h-1,F.m(5.5),C['--ink3'],'left');tx(c,'SCÈNE',scx,h-1,F.m(5.5),C['--ink3'],'left')};
D.gatem=(c,w,h,t,C,S,o)=>{const st=o.gst||o.b.gate.st;feu(c,12,9,st,C,t);tx(c,st,44,18,F.m(7,600),st==='PASSAGE'?C['--grn2']:st==='RETENU'?C['--rouge']:st==='EN COURS'?C['--ink3']:C['--amb'],'left','1px');tx(c,o.b.gate.name,44,36,F.m(7),C['--ink2'],'left','.5px');if(o.b.id==='g45'){fr(c,44,50,w-56,4,C['--panel3']);fr(c,44,50,(w-56)*S.voted/S.total,4,C['--grn2']);tx(c,S.voted+'/'+S.total,44,64,F.m(7,600),C['--cy'],'left')}};

/* aperçus de rôle (inspecteur) */
function role(kind,c,w,h,t,C,S,sp){const pv=sp?sp.pv:'';
 if(kind==='phone'){phone(c,0,0,w,h,C,(x,y,W,H)=>{fr(c,x,y,W,H,C['--bg']);
  if(['vote','vote_ui','gate','histo','switch','noresp','gatem','seg'].includes(pv)){tx(c,'OÙ DOIT-IL',x+W/2,y+20,F.d(6),C['--ink'],'center');tx(c,'ALLER ?',x+W/2,y+29,F.d(6),C['--ink'],'center');OPTS.forEach((n,i)=>{fr(c,x+5,y+44+i*24,W-10,20,C['--panel2']);fr(c,x+5,y+44+i*24,3,20,C['--pseudo-'+(i*4+2)]);tx(c,n,x+12,y+54+i*24,F.u(7.5,600),C['--ink'])});ring(c,x+W/2,y+H-20,9,S.remain/90,S.remain<=10?C['--amb']:C['--cy'],C['--panel3'],2);fr(c,x+5,y+H-6,W-10,2,C['--or'])}
  else if(['color','wave','strobe'].includes(pv)){fr(c,x,y,W,H,pv==='strobe'&&((t*2.5)%1<.5)?C['--titre-clair']:'#7d5bd6')}
  else if(pv==='vibe'){const p=(t*3)%1<.3;tx(c,'BZZ',x+W/2+(p?1:0),y+H/2,F.d(9),C['--ink'],'center');sr(c,x+6,y+6,W-12,H-12,p?C['--amb']:C['--line'])}
  else if(pv==='msg'){sr(c,x+8,y+H*.35,W-16,30,C['--coral-2'],1.2);fr(c,x+W/2-3,y+H*.35+14,6,6,C['--or']);tx(c,'garde-le',x+W/2,y+H*.35+46,F.u(7,500),C['--ink2'],'center');tx(c,'pour toi',x+W/2,y+H*.35+56,F.u(7,500),C['--ink2'],'center')}
  else if(['react','seismo'].includes(pv)){['🔥','😱','😂','❤️','👏','⚡'].forEach((e,i)=>{const bx=x+5+(i%2)*((W-12)/2+2),by=y+H*.3+Math.floor(i/2)*30;fr(c,bx,by,(W-12)/2,26,C['--panel2']);c.font='13px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(e,bx+(W-12)/4,by+13)})}
  else if(['text','screen'].includes(pv)){tx(c,'consigne',x+5,y+14,F.u(7,500),C['--ink3']);fr(c,x+4,y+H-46,W-8,12,C['--panel2']);tx(c,'trop bien',x+7,y+H-40,F.u(7,500),C['--ink']);for(let r=0;r<3;r++)for(let k=0;k<7;k++)fr(c,x+3+k*((W-6)/7),y+H-30+r*9,(W-6)/7-1,7,C['--panel3'])}
  else {const p=(Math.sin(t*1.6)+1)/2;c.globalAlpha=.25+.5*p;dot(c,x+W/2,y+H/2,4+p*2,C['--cy']);c.globalAlpha=1;tx(c,'Zoé42',x+W/2,y+H/2+22,F.u(8,600),C['--ink2'],'center');tx(c,'BIENTÔT',x+W/2,y+H/2+34,F.m(5.5),C['--ink3'],'center','1px')}})}
 else if(kind==='stream'){phone(c,0,0,w,h,C,(x,y,W,H)=>{fr(c,x,y,W,H,C['--panel3']);for(let i=0;i<60;i++)fr(c,x+((i*29)%W),y+((i*47)%H),2,2,C['--dot-hi']);if(pv==='stream'){fr(c,x,y+10,W,30,S.recu?C['--veil']:C['--amb']);tx(c,'VA VERS',x+W/2,y+20,F.d(6),S.recu?C['--ink']:C['--on-amb'],'center');tx(c,'LA BOULANG.',x+W/2,y+30,F.d(6),S.recu?C['--ink']:C['--on-amb'],'center');fr(c,x+4,y+H-24,W-8,18,S.recu?C['--grn']:C['--or']);tx(c,S.recu?'REÇU ✓':'REÇU',x+W/2,y+H-15,F.u(7.5,700),S.recu?C['--on-grn']:C['--on-or'],'center')}else{tx(c,'24 I/S',x+W-4,y+10,F.m(5.5,600),C['--cy'],'right');fr(c,x+4,y+H-20,W-8,14,C['--veil']);tx(c,'🔥 42  😱 18',x+W/2,y+H-13,F.u(6.5,500),C['--ink'],'center')}})}
 else {fr(c,0,0,w,h,C['--salle-noir']);sr(c,0,0,w,h,C['--line']);
  if(['vote','vote_ui','gate','histo','switch','noresp','gatem','seg'].includes(pv)){const mx=Math.max(...S.votes);S.votes.forEach((v,i)=>{const bw=(w-40)/3,bh=(v/80)*(h-40),x=14+i*(bw+6);fr(c,x,h-16-bh,bw,bh,v===mx?C['--titre-clair']:C['--pseudo-'+(i*4+2)]);tx(c,OPTS[i].toUpperCase(),x+bw/2,h-8,F.d(4.5),C['--titre-clair'],'center')})}
  else if(['color','wave','strobe'].includes(pv)){c.globalAlpha=.5;fr(c,0,0,w,h,'#7d5bd6');c.globalAlpha=1}
  else D.stage(c,w,h,t,C,S,{p:[.6]});
  fr(c,w*.38,h*.18,w*.24,h*.44,C['--panel3']);sr(c,w*.38,h*.18,w*.24,h*.44,C['--line-amb']);tx(c,'VISAGE',w/2,h*.4,F.m(5),C['--amb'],'center','1px')}}

const CVARS=['--bg','--panel','--panel2','--panel3','--ink','--ink2','--ink3','--cy','--or','--grn','--grn2','--amb','--rouge','--line','--line-amb','--line-cy','--dot','--dot-hi','--coral-1','--coral-2','--coral-3','--spec-1','--spec-2','--spec-3','--spec-4','--black','--veil','--on-or','--on-amb','--on-grn','--on-rouge','--salle-noir','--titre-clair','--titre-sombre','--fam-trig','--fam-flow','--fam-data','--fam-cible','--fam-fx','--fam-ui','--fam-scene','--fam-gate','--exec','--t-num','--t-txt','--t-bool','--t-cible','--t-media','--nd-ryt'];
for(let i=1;i<=12;i++)CVARS.push('--pseudo-'+i);for(let i=1;i<=8;i++)CVARS.push('--eq-'+i);
function readColors(){const cs=getComputedStyle(document.documentElement);const C={};CVARS.forEach(v=>C[v]=cs.getPropertyValue(v).trim()||'#888');return C}
window.SRB={HD,PH,ROWH,SETH,PSEUDOS,TEAMS,OPTS,FAM,FAMS,TY,SP,compat,geo,fmt,mkLogic,mkMacro,SEGS,SEQS,PATH,D,role,readColors,F,fr,sr,tx};
})();
