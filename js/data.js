'use strict';
// Static game data: terrain, buildings, units, technologies, perks, events, achievements.

const TS = 40, BARB = 9;
const SAVE_KEY = 'ironGrain.save.v1', PROF_KEY = 'ironGrain.profile.v1';
const N8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

const TERR = {
  water:    {n:'Water', c:'#2f6587', mv:0, i:'🌊'},
  plains:   {n:'Plains', c:'#8dab58', mv:1, i:'🌿'},
  fertile:  {n:'Fertile plains', c:'#6aa444', mv:1, i:'🌱'},
  forest:   {n:'Forest', c:'#4a7337', mv:2, def:.25, i:'🌲'},
  hills:    {n:'Hills', c:'#a3925f', mv:2, def:.25, i:'⛰️'},
  mountain: {n:'Mountains', c:'#7c7467', mv:3, def:.5, i:'🏔️'},
  desert:   {n:'Desert', c:'#d5c089', mv:1, i:'🏜️'},
};
const RI = {food:'🌾', wood:'🪵', stone:'🪨', iron:'🔩', gold:'🪙', know:'📖'};
const RN = {food:'Food', wood:'Wood', stone:'Stone', iron:'Iron', gold:'Gold', know:'Knowledge'};
const RES5 = ['food','wood','stone','iron','gold'];
const FLAT = ['plains','fertile','desert','hills'];

const BLD = {
  house:   {n:'Houses', i:'🏠', cost:{wood:15}, jobs:0, d:'Homes for your people. Housing +5 / +10 / +16.'},
  farm:    {n:'Farm', i:'🌾', cost:{wood:10}, jobs:2, on:['plains','fertile','desert'], d:'Grows food. Fertile land +2. Each neighbouring farm +1 (max +2).'},
  lumber:  {n:'Lumber Camp', i:'🪓', cost:{wood:5,gold:10}, jobs:2, on:['forest'], d:'Cuts wood. +1 per neighbouring forest (max +3).'},
  quarry:  {n:'Quarry', i:'⛏️', cost:{wood:15}, jobs:2, on:['hills'], d:'Cuts stone (4). +1 next to mountains.'},
  mine:    {n:'Mine', i:'⚒️', cost:{wood:20,stone:10}, jobs:3, on:['hills','mountain'], tech:'mining', d:'Iron deposits give iron. Gold veins give gold and luxury (happiness). Bare rock gives a little iron and stone.'},
  library: {n:'Library', i:'📚', cost:{wood:20,stone:10}, jobs:2, tech:'writing', d:'Produces knowledge. +1 per neighbouring library or academy.'},
  market:  {n:'Market', i:'⚖️', cost:{wood:25,stone:10}, jobs:2, tech:'currency', d:'Produces gold. +1 per neighbouring house level (max +4). Unlocks trading.'},
  temple:  {n:'Temple', i:'⛪', cost:{stone:25,gold:15}, jobs:1, d:'Happiness +8 / +13 / +18 across the realm.'},
  barracks:{n:'Barracks', i:'🛡️', cost:{wood:25,stone:10}, jobs:1, d:'Needed to train soldiers. Higher levels train more experienced troops.'},
  tower:   {n:'Watchtower', i:'🗼', cost:{stone:30}, jobs:1, tech:'masonry', d:'Extends your borders, sees far and shoots nearby enemies.'},
  stable:  {n:'Stables', i:'🐴', cost:{wood:30,gold:20}, jobs:1, tech:'horse', d:'Needed to train mounted units.'},
  harbor:  {n:'Harbor', i:'⚓', cost:{wood:30}, jobs:2, tech:'sailing', coast:1, d:'Food and gold from the sea. Must be next to water.'},
  smithy:  {n:'Blacksmith', i:'🔨', cost:{stone:25,iron:10}, jobs:2, tech:'iron', d:'All your soldiers +8% strength per level (your best smithy counts).'},
  academy: {n:'Academy', i:'🎓', cost:{stone:40,gold:40}, jobs:3, tech:'philosophy', d:'Lots of knowledge. Commanders gain experience 50% faster.'},
  bank:    {n:'Bank', i:'🏦', cost:{stone:50,gold:60}, jobs:2, tech:'banking', d:'+3 gold, and +15% of all gold income per level.'},
  monument:{n:'Grand Monument', i:'🗿', cost:{stone:120,wood:80,gold:100,iron:30}, jobs:0, tech:'architecture', wonder:1, d:'Build 5 stages (one per turn, each costs the same) to win a Wonder victory.'},
};

const UNI = {
  scout:   {n:'Scout', i:'🧭', str:4, mv:4, sight:3, cost:{gold:12}, up:1, d:'Fast explorer. Sees far. Weak in battle.'},
  militia: {n:'Militia', i:'🗡️', str:8, mv:2, cost:{gold:15,food:10}, up:1, d:'Cheap early defenders. No barracks needed.'},
  spear:   {n:'Spearmen', i:'🔱', str:11, mv:2, cost:{gold:20,wood:10}, up:1, tech:'bronze', anti:1, d:'Solid defenders. +50% vs mounted units.'},
  archer:  {n:'Archers', i:'🏹', str:6, rstr:9, rng:2, mv:2, cost:{gold:20,wood:15}, up:1, tech:'archery', d:'Ranged: attack from 2 tiles, no counter-attack.'},
  horse:   {n:'Horsemen', i:'🐎', str:13, mv:4, mount:1, cost:{gold:30,food:15}, up:2, tech:'horse', need:'stable', d:'Fast raiders and flankers.'},
  sword:   {n:'Swordsmen', i:'⚔️', str:15, mv:2, cost:{gold:30,iron:10}, up:2, tech:'iron', d:'Strong all-round infantry.'},
  catapult:{n:'Catapult', i:'☄️', str:4, rstr:14, rng:2, mv:1, siege:1, cost:{gold:35,wood:30,stone:10}, up:2, tech:'engineering', d:'Siege: double damage vs towns and camps.'},
  knight:  {n:'Knights', i:'🏇', str:22, mv:3, mount:1, cost:{gold:50,iron:15}, up:3, tech:'chivalry', need:'stable', d:'Heavy cavalry. Devastating charge.'},
  musket:  {n:'Musketeers', i:'💂', str:28, mv:2, cost:{gold:60,iron:15}, up:3, tech:'gunpowder', d:'Gunpowder infantry. Masters of the field.'},
  cannon:  {n:'Cannon', i:'💣', str:6, rstr:32, rng:3, mv:1, siege:1, cost:{gold:70,iron:20,wood:20}, up:3, tech:'artillery', d:'Long-range siege. Range 3.'},
  settler: {n:'Settlers', i:'🛖', str:0, mv:2, civ:1, cost:{food:40,gold:40}, pop:2, up:1, d:'Found a new town at least 4 tiles from others. Costs 2 population.'},
  hero:    {n:'Commander', i:'🎖️', str:8, mv:3, sight:3, up:3, hero:1, d:'Boosts neighbouring units and levels up.'},
};
const TRAIN_ORDER = ['militia','scout','spear','archer','horse','sword','catapult','knight','musket','cannon','settler'];
// Unit mixes used by rivals and barbarians as the ages advance.
const TIERS = [['militia'],['militia','spear','archer'],['spear','archer','sword','horse'],['sword','horse','knight','catapult','archer'],['musket','knight','cannon','sword']];

const TECH = [
  {id:'agri', n:'Agriculture', c:25, r:[], t:1, d:'Farms +1 food.'},
  {id:'writing', n:'Writing', c:20, r:[], t:1, d:'Unlocks the Library.'},
  {id:'mining', n:'Mining', c:25, r:[], t:1, d:'Unlocks the Mine.'},
  {id:'bronze', n:'Bronze Working', c:30, r:[], t:1, d:'Unlocks Spearmen.'},
  {id:'archery', n:'Archery', c:30, r:[], t:1, d:'Unlocks Archers.'},
  {id:'masonry', n:'Masonry', c:60, r:['mining'], t:2, d:'Watchtowers, level 2 buildings, City upgrades. Towns +4 strength.'},
  {id:'horse', n:'Horseback Riding', c:60, r:['agri'], t:2, d:'Stables and Horsemen.'},
  {id:'currency', n:'Currency', c:60, r:['writing'], t:2, d:'Markets and trading.'},
  {id:'sailing', n:'Sailing', c:50, r:[], t:2, d:'Harbors.'},
  {id:'iron', n:'Iron Working', c:120, r:['bronze','mining'], t:3, d:'Blacksmith and Swordsmen.'},
  {id:'philosophy', n:'Philosophy', c:120, r:['writing'], t:3, d:'Academy. +20% knowledge.'},
  {id:'engineering', n:'Engineering', c:130, r:['masonry'], t:3, d:'Level 3 buildings, Catapults, Metropolis upgrades. Towns +6 strength.'},
  {id:'medicine', n:'Medicine', c:110, r:['writing'], t:3, d:'+50% population growth. Units heal +10 per turn.'},
  {id:'banking', n:'Banking', c:220, r:['currency'], t:4, d:'Banks.'},
  {id:'chivalry', n:'Chivalry', c:220, r:['horse','iron'], t:4, d:'Knights.'},
  {id:'tactics', n:'Military Tactics', c:240, r:['iron','philosophy'], t:4, d:'New soldiers start with +15 XP. +1 commander slot.'},
  {id:'gunpowder', n:'Gunpowder', c:380, r:['engineering','iron'], t:5, d:'Musketeers. Towns +10 strength.'},
  {id:'architecture', n:'Architecture', c:400, r:['engineering','philosophy'], t:5, d:'The Grand Monument (Wonder victory).'},
  {id:'economics', n:'Economics', c:500, r:['banking'], t:6, d:'+25% gold. +8 happiness.'},
  {id:'artillery', n:'Artillery', c:550, r:['gunpowder'], t:6, d:'Cannons.'},
];
const TECH_BY = Object.fromEntries(TECH.map(t => [t.id, t]));

const TAX = [
  {n:'Low', g:.4, h:10}, {n:'Normal', g:.7, h:0}, {n:'High', g:1, h:-10}, {n:'Harsh', g:1.4, h:-25},
];
const TOWN_LV = ['', 'Village', 'Town', 'City', 'Metropolis'];
const TOWN_I = ['', '🏘️', '🏛️', '🏰', '🏯'];
const TOWN_HOUSING = [0, 6, 12, 20, 32];
const TOWN_UP = {
  2: {pop:12, cost:{wood:60, stone:40, gold:50}},
  3: {pop:35, cost:{wood:120, stone:120, gold:120}, tech:'masonry'},
  4: {pop:70, cost:{wood:250, stone:250, gold:250, iron:40}, tech:'engineering'},
};
const TRADE = {food:10, wood:12, stone:15, iron:25}; // gold to buy 10 units

const RANKS = ['Recruit','Regular','Veteran','Elite','Legend'];
const RXP = [0, 10, 25, 50, 90];
const PERKS = {
  woodsman: {n:'Woodsman', d:'+33% fighting in forests'},
  highland: {n:'Highlander', d:'+33% in hills & mountains, which cost 1 move'},
  swift:    {n:'Swift', d:'+1 movement'},
  medic:    {n:'Medic', d:'Heals neighbouring allies +10 each turn'},
  fury:     {n:'Fury', d:'+25% when attacking'},
  shield:   {n:'Shield Wall', d:'+25% when defending'},
  breaker:  {n:'Siegebreaker', d:'+50% vs towns & camps'},
  hunter:   {n:'Raider Hunter', d:'+50% vs barbarians'},
  march:    {n:'Forced March', d:'Heals even after moving or fighting'},
  sniper:   {n:'Marksman', d:'+1 range', r:1},
  lancer:   {n:'Lancer', d:'+50% vs ranged & siege units', m:1},
};
const TRAITS = {
  bold: {n:'Bold', d:'+10% attack'}, cautious: {n:'Cautious', d:'+10% defence'},
  ambitious: {n:'Ambitious', d:'+30% experience'}, inspiring: {n:'Inspiring', d:'Aura +5%'},
  frugal: {n:'Frugal', d:'Upkeep 1 instead of 3'},
};
const FIRST = ['Aldric','Brenna','Cassius','Dagny','Edric','Freya','Gareth','Hilda','Ivor','Jora','Kael','Lyra','Magnus','Nessa','Osric','Petra','Rowan','Sigrid','Tobias','Ulla','Viktor','Wren','Yara','Zoran','Ansel','Maren'];
const LAST = ['Ironhand','Blackwood','Stormborn','Ashford','Redmane','Oakheart','Grimsby','Thorne','Valewood','Hale','Swiftblade','Marrow','Stonebridge','Wolfsbane','Greyholm','Brightspear'];
const TN_A = ['Oak','Stone','Wolf','Raven','Iron','Ash','Frost','Gold','Elm','Thorn','Wind','Red','Silver','High','Black','Deep','Bright','Mill','Salt','Hart','Swan','Kings'];
const TN_B = ['ford','haven','hold','bridge','field','wick','moor','crest','vale','gate','mere','stead','watch','fall','brook','ton','burg','keep'];
const REALM_A = ['Kingdom','Duchy','Realm','Principality','Dominion','March'];
const REALM_B = ['Aldmere','Brightvale','Caerwyn','Dunmoor','Eastmarch','Faircrest','Greywater','Highmoor','Ironvale','Kingsreach','Lowmere','Northwatch','Oakenshire','Ravenholm','Stormhold','Westerly'];
const RIVALS = [{n:'Crimson Dominion', c:'#e0533f'}, {n:'Violet Covenant', c:'#a96be0'}, {n:'Amber Horde', c:'#f0a23a'}, {n:'Jade League', c:'#39c29f'}];
const PLAYER_COL = '#4da3ff';
const BARBF = {id:BARB, name:'Barbarians', c:'#b0301f'};

const DIFFS = [
  {n:'Settler', ai:.8, aggr:.6, grace:35, score:.8, lv:1, d:'Gentle. Rivals grow slowly.'},
  {n:'Chieftain', ai:1, aggr:1, grace:25, score:1, lv:1, d:'The standard challenge.'},
  {n:'Warlord', ai:1.2, aggr:1.3, grace:18, score:1.4, lv:3, d:'Aggressive, well-armed rivals.'},
  {n:'Emperor', ai:1.45, aggr:1.6, grace:12, score:1.9, lv:6, d:'Only for seasoned rulers.'},
];
const LEGACY = [
  {id:'none', n:'No legacy', lv:1, d:'A humble beginning.'},
  {id:'fertile', n:'Fertile Lands', lv:2, d:'All farms +1 food.'},
  {id:'guard', n:'Veteran Guard', lv:3, d:'Start with an extra Veteran Militia and a Barracks.'},
  {id:'scholar', n:'Scholar Kings', lv:4, d:'+25% knowledge.'},
  {id:'merchant', n:'Merchant Princes', lv:5, d:'+60 starting gold, +15% gold.'},
  {id:'builder', n:'Master Builders', lv:6, d:'Buildings cost 20% less.'},
  {id:'warrior', n:'Warrior Blood', lv:8, d:'All soldiers +10% strength.'},
  {id:'golden', n:'Golden Age', lv:10, d:'+10 happiness, +10% growth.'},
];

const ACH = [
  {id:'blood', n:'First Blood', d:'Win your first battle.', xp:40},
  {id:'camp', n:'Camp Breaker', d:'Destroy a barbarian camp.', xp:60},
  {id:'town', n:'Township', d:'Grow a village into a Town.', xp:60},
  {id:'city', n:'City Walls', d:'Grow a City.', xp:100},
  {id:'metro', n:'Metropolis', d:'Grow a Metropolis.', xp:200},
  {id:'pop50', n:'Thriving', d:'Reach 50 population.', xp:100},
  {id:'pop120', n:'Teeming Masses', d:'Reach 120 population.', xp:200},
  {id:'tech10', n:'Age of Reason', d:'Discover 10 technologies.', xp:100},
  {id:'techall', n:'Omniscient', d:'Discover every technology.', xp:250},
  {id:'found', n:'Pioneer', d:'Found a new settlement.', xp:60},
  {id:'conquer', n:'Conqueror', d:'Capture a rival capital.', xp:150},
  {id:'legend', n:'Living Legend', d:'Promote a unit to Legend rank.', xp:120},
  {id:'hero5', n:'Great Captain', d:'Raise a commander to level 5.', xp:120},
  {id:'rich', n:'Treasure Hoard', d:'Hold 1,000 gold.', xp:100},
  {id:'bliss', n:'Golden Days', d:'Reach 90 happiness.', xp:80},
  {id:'ruins', n:'Treasure Hunter', d:'Explore 5 ruins in one game.', xp:60},
  {id:'army10', n:'Grand Army', d:'Command 10 soldiers at once.', xp:80},
  {id:'wonder', n:'Eternal Monument', d:'Complete the Grand Monument.', xp:200},
  {id:'win', n:'Victor', d:'Win a game.', xp:150},
  {id:'winhard', n:'Warlord', d:'Win on Warlord or Emperor.', xp:300},
];

// Random events. p = price paid, g = resources gained, f = custom effect, fx = effect label.
const EV = [
  {t:'Bountiful Harvest', i:'🌾', d:'A golden summer leaves the granaries overflowing.', c:[{l:'Store the grain', g:{food:40}}, {l:'Sell the surplus', g:{gold:30}}]},
  {t:'Travelling Merchants', i:'🐪', d:'A caravan arrives offering timber and cut stone.', c:[{l:'Buy timber', p:{gold:25}, g:{wood:45}}, {l:'Buy stone', p:{gold:25}, g:{stone:35}}, {l:'Send them on their way'}]},
  {t:'Plague', i:'🦠', min:15, d:'Sickness spreads through the crowded streets.', c:[{l:'Pay physicians', p:{gold:40}}, {l:'Let it run its course', fx:'Lose 15% of your people', f:()=>{const f=G.f[0]; f.pop=Math.max(1,f.pop-Math.ceil(f.pop*.15));}}]},
  {t:'Refugees', i:'🧳', d:'Families fleeing raiders beg to settle in your lands.', c:[{l:'Welcome them', fx:'+3 👥, −5 😊', f:()=>{G.f[0].pop+=3; G.f[0].hmod-=5;}}, {l:'Turn them away'}]},
  {t:'Gold Vein', i:'✨', d:'Miners strike a rich seam of gold.', c:[{l:'Excellent!', g:{gold:50}}]},
  {t:'Festival Season', i:'🎉', d:'The people call for a grand midsummer festival.', c:[{l:'Fund the festival', p:{gold:30}, fx:'+15 😊', f:()=>G.f[0].hmod+=15}, {l:'Refuse', fx:'−6 😊', f:()=>G.f[0].hmod-=6}]},
  {t:'Mercenary Company', i:'⚔️', min:10, d:'A company of hardened veterans offers its swords.', c:[{l:'Hire them', p:{gold:70}, fx:'Veteran Swordsmen join you', f:()=>{const u=spawnNear(capital(),'sword',0); if(u){u.xp=25; updateRank(u,1);}}}, {l:'Decline'}]},
  {t:'Wandering Scholar', i:'🧙', d:'A learned traveller offers to teach at your court.', c:[{l:'Host the scholar', p:{gold:25}, fx:'Big research boost', f:()=>{const f=G.f[0]; f.prog+=f.cur?Math.round(TECH_BY[f.cur].c*.5):40;}}, {l:'Decline'}]},
  {t:'Great Fire', i:'🔥', d:'Fire tears through the timber yards!', c:[{l:'Fight the fire', p:{gold:20}}, {l:'Let it burn', fx:'Lose half your wood', f:()=>G.f[0].res.wood=Math.floor(G.f[0].res.wood/2)}]},
  {t:'Comet Sighted', i:'☄️', d:'A bright comet blazes across the sky. The priests call it a sign of favour.', c:[{l:'Celebrate', fx:'+10 😊', f:()=>G.f[0].hmod+=10}]},
  {t:'Bandit Ultimatum', i:'🏴', min:12, d:'Bandit chiefs demand tribute, or they will raid your borders.', c:[{l:'Pay tribute', p:{gold:35}}, {l:'Refuse and prepare', fx:'Raiders appear at your border', f:()=>raidBorder(2)}]},
  {t:'Landslide', i:'🪨', d:'A landslide exposes fine building stone near your capital.', c:[{l:'Haul it away', g:{stone:40}}]},
  {t:'Wandering Captain', i:'🎖️', min:8, ok:()=>heroCount()<maxHeroes(), d:'A seasoned captain seeks a lord worth serving.', c:[{l:'Offer a commission', p:{gold:45}, fx:'Gain a commander', f:()=>hireHero(genCandidate(),true)}, {l:'Decline'}]},
  {t:'Baby Boom', i:'👶', d:'A peaceful year brings many new families.', c:[{l:'Wonderful', fx:'+2 👥', f:()=>G.f[0].pop+=2}]},
  {t:'Iron Traders', i:'🔩', min:15, d:'Mountain traders bring carts of iron ingots.', c:[{l:'Buy iron', p:{gold:40}, g:{iron:25}}, {l:'Decline'}]},
  {t:'Drought', i:'☀️', min:10, d:'The rains fail and the fields crack.', c:[{l:'Open the granaries', fx:'Lose 30 🌾', f:()=>G.f[0].res.food=Math.max(0,G.f[0].res.food-30)}, {l:'Pray for rain', fx:'−8 😊', f:()=>G.f[0].hmod-=8}]},
  {t:'Envoy Arrives', i:'📜', min:18, ok:()=>G.f.some(f=>f.id&&f.alive&&f.met&&f.stance==='peace'), make(){
    const r=pick(G.f.filter(f=>f.id&&f.alive&&f.met&&f.stance==='peace'));
    return {t:'Envoy Arrives', i:'📜', d:`An envoy from the ${r.name} arrives bearing gifts.`, c:[{l:'Accept the gifts', g:{gold:30}}, {l:'Return them with honour', fx:'Relations improve', f:()=>r.att+=20}]};
  }},
];

const HELP = `
<h3>How to win</h3>
<ul><li><b>Conquest</b>: capture every rival town.</li><li><b>Wonder</b>: research Architecture, then complete all 5 stages of the Grand Monument.</li></ul>
<p>Every game earns <b>Ruler XP</b> (more on harder difficulties). Levelling up unlocks <b>legacies</b> (starting bonuses) and harder difficulties. Achievements give bonus XP.</p>
<h3>Controls</h3>
<ul><li>Drag to move the map, pinch to zoom.</li><li>Tap a tile, town or unit to see what you can do there.</li><li>🏗️ Build shows every building and highlights where it fits.</li><li>End Turn when you're done. The game saves automatically every turn.</li></ul>
<h3>Economy</h3>
<ul><li>Each citizen eats ½ food and pays tax. With spare food, room in houses and happiness 30+, your population grows.</li>
<li>Buildings need <b>workers</b>. If there are more jobs than people, every building runs slower. Unemployed people only pay tax.</li>
<li><b>Placement matters</b>: farms like fertile land and other farms, lumber camps like deep forest, markets like houses, libraries like each other.</li>
<li><b>Happiness</b> scales all output (75% to 125%). Raise it with temples, lower taxes, gold mines and festivals. Big realms and wars lower it.</li>
<li>Upgrade your town hall (tap your town) to push your borders out. Settlers found new towns. Watchtowers extend borders too.</li></ul>
<h3>War</h3>
<ul><li>Tap your unit: lit tiles show where it can move, red frames show what it can attack. You'll see a prediction before you commit.</li>
<li>Forests and hills give +25% defence, mountains +50%, your own town +50%. Fortify for +25%.</li>
<li>Ranged units take no counter-attack. Siege units do double damage to towns. Only melee units can capture a town once its HP reaches 0.</li>
<li>Units gain XP and ranks. From Veteran upwards each rank adds a random perk. <b>Commanders</b> (hire them in Realm → Tavern) boost neighbouring units and let you choose their skills.</li>
<li>Barbarian camps send raiders that pillage buildings. Repair pillaged buildings from their tile. Destroy camps for gold.</li>
<li>Rivals start at peace but may declare war. Check Realm → Diplomacy for gifts, peace offers and tribute.</li></ul>
<h3>Tips</h3>
<ul><li>Early on: houses and farms, a lumber camp, then Writing for a library.</li><li>Build a Barracks before raiders arrive (around turn 8–15).</li><li>Explore ruins 🏚️ with your scout for treasure.</li><li>Check Realm → Advisor when unsure what to do next.</li></ul>`;
