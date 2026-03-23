const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
const SHEETS_URL     = 'https://script.google.com/macros/s/AKfycby6zh68MVuWCVCkyJv5vmfqCUebtib1DK8cjtbTDRUhqeWjmVAlOR955UXx0lNrlZsm8Q/exec';

const sessions = {};

const PORTFOLIO_OPTS = ['Less than $20k','$20k–$30k','$30k–$50k','$50k–$100k','$100k–$500k','$500k+'];
const HIGH_VALUE = ['$50k–$100k','$100k–$500k','$500k+'];

const SYS = `You are Koroush AK, founder of Zero Complexity Trading (ZCT). Direct, warm, plain language. Short sentences. One idea at a time.

ZCT LEVELS:
0 — No Strategy: no journal, no routine, trading on gut or tips.
1 — Inconsistent Strategy: has some rules but doesn't follow them consistently.
2 — Consistent Strategy: follows rules 90%+ but equity flat or negative. No proven edge yet.
3 — Consistent & Profitable: positive expectancy over 30+ trades, upward equity curve.
4 — Consistent, Profitable & Scaled: multiple edges, profitable at meaningful size.

TONE: Short sentences. Specific to their answers. No waffle.
FORMAT: Plain text only. No markdown. No asterisks. Every label and value on the same line.

OUTPUT must begin with exactly: ZCT ASSESSMENT RESULTS

YOUR CURRENT LEVEL: [Level N — Full Name]
[2 sentences max.]

DIMENSION BREAKDOWN

STRATEGY: [one sentence summary]
Current State: [what their strategy looks like]
Strengths: [one thing working]
Gap: [one thing missing]

RISK: [one sentence summary]
Current State: [what their risk management looks like]
Strengths: [one thing working]
Gap: [one thing missing]

PSYCHE: [one sentence summary]
Current State: [what their routine and psychology looks like]
Strengths: [one thing working]
Gap: [one thing missing]

YOUR PRIMARY BOTTLENECK
[2-3 short sentences. Specific to their answers.]

THE MOST COMMON MISTAKE AT YOUR LEVEL
[2-3 short sentences. Tied to what they said.]

YOUR ROADMAP

NEXT 30 DAYS
Core Focus: [one sentence]
Daily Action 1: [one sentence]
Daily Action 2: [one sentence]
Weekly Challenge: [one sentence]
Success Metric: [one sentence]

NEXT 90 DAYS
What changes: [one sentence]
ZCT Iteration Focus: [one sentence]
Skill to develop: [one sentence]
Milestone: [one sentence]

6-12 MONTH TARGET
Target Level: [full level name]
What it takes: [one sentence]
What surfaces next: [one sentence]
The ongoing work: [one sentence]

YOUR NEXT ACTION
[One thing they can do today, in under an hour.]

WHERE YOU ARE AND WHERE YOU ARE GOING
[Paragraph 1: 2-3 sentences. Honest, warm. Reference their goal.]
[Paragraph 2: 2-3 sentences. What becomes possible. Mention ZCT EV+ Program naturally. End on forward momentum.]`;

// ── HELPERS ───────────────────────────────────────────────
function newSession(telegramHandle) {
  return {
    state: 'name',
    data: { name:'', telegram: telegramHandle||'', goalRaw:'', goalPath:'', goalMonthly:'', portfolio:'', profitable:'', howLong:'', trajectory:'', lifeImpact:'', experience:'', rules:'', journal:'', stoploss:'', leverage:'' }
  };
}

function classifyGoal(text) {
  const t = text.toLowerCase();
  const problemWords = ['problem','issue','fix','stop','improve','overtrading','consistency','consistent','discipline','losses','drawdown','struggling','can\'t','cannot','system','strategy','rules','journal','manage','control','emotional','psychology','learn','understand','figure out','work out','get better','better at'];
  const lifestyleWords = ['freedom','free','quit','replace','retire','lifestyle','passive','full time','fulltime','full-time','independent','leave','job','career','income','living'];
  const financialWords = ['

function feasibilityMsg(portfolio, monthly) {
  const mids = {'Less than $20k':10000,'$20k–$30k':25000,'$30k–$50k':40000,'$50k–$100k':75000,'$100k–$500k':300000,'$500k+':750000};
  const mid = mids[portfolio] || 10000;
  const fmt = n => n>=1000 ? '$'+(n/1000).toFixed(n%1000===0?0:1)+'k' : '$'+n;
  const lo = Math.round(mid*.05), hi = Math.round(mid*.10);
  if (!monthly || monthly === 'none') return `That's fine. In our experience, a profitable trader with a ${portfolio} portfolio can typically make ${fmt(lo)}–${fmt(hi)} per month.`;
  if (monthly === 'skill') return `Great — that's exactly how we believe you should be thinking at your current stage.`;
  const t = monthly.toLowerCase().replace(/,/g,'');
  let amt = null, m;
  if ((m=t.match(/\$?([\d.]+)\s*k/))) amt = parseFloat(m[1])*1000;
  else if ((m=t.match(/\$?([\d.]+)/))) amt = parseFloat(m[1]);
  if (!amt) return `In our experience, a profitable trader with a ${portfolio} portfolio can typically make ${fmt(lo)}–${fmt(hi)} per month.`;
  const pct = (amt/mid)*100;
  if (pct <= 10) return `Based on your portfolio size, that seems very realistic. A profitable trader with a ${portfolio} portfolio can typically make ${fmt(lo)}–${fmt(hi)} per month — right in line with your goal.`;
  return `Based on your portfolio size, that's an ambitious target. A profitable trader with a ${portfolio} portfolio can typically make ${fmt(lo)}–${fmt(hi)} per month. You'll need to grow both your edge and your capital together.`;
}

function bridgeMsg(u) {
  const raw = u.goalRaw.trim();
  const lower = raw.toLowerCase();
  let goalPhrase;
  if (lower.startsWith('i want to')) goalPhrase = lower.replace('i want to', 'you want to');
  else if (lower.startsWith('i want')) goalPhrase = lower.replace('i want', 'you want');
  else goalPhrase = `achieve: ${raw}`;
  return `Ok, got it — so ${goalPhrase}.\n\nTo do that, you need to eventually become a Level 4 trader. We'll start by identifying your current trader level.`;
}

function splitMessage(text, max = 4000) {
  const chunks = [];
  while (text.length > max) {
    let i = text.lastIndexOf('\n', max);
    if (i < 0) i = max;
    chunks.push(text.slice(0, i));
    text = text.slice(i).trim();
  }
  if (text) chunks.push(text);
  return chunks;
}

// ── TELEGRAM API ──────────────────────────────────────────
async function send(chatId, text, keyboard = null) {
  const body = { chat_id: chatId, text };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
}

async function answerCb(id) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ callback_query_id: id })
  });
}

function kb(options) {
  return options.map(o => [{ text: o, callback_data: o }]);
}

// ── STATE MACHINE ─────────────────────────────────────────
async function runState(chatId, session) {
  const u = session.data;
  const s = session.state;

  if (s === 'name') {
    await send(chatId, `Hi! I'm AI AK, my job is to help you understand:\n\n→ Why you're not where you want to be\n→ How to get where you want to go\n→ Give you the resources you need to get there\n\nFirst — what's your name?`);
    return;
  }

  if (s === 'goal') {
    await send(chatId, `Hey ${u.name}! I'm looking forward to helping you on your trading journey.\n\nWhat are your trading goals?`);
    return;
  }

  if (s === 'goal_classify') {
    u.goalPath = classifyGoal(u.goalRaw);
    if (u.goalPath === 'financial') session.state = 'p1_portfolio';
    else if (u.goalPath === 'lifestyle') session.state = 'p2_portfolio';
    else session.state = 'p3_wider';
    await runState(chatId, session);
    return;
  }

  // PATH 1 — Financial
  if (s === 'p1_portfolio') {
    await send(chatId, `Love the goal, ${u.name}. How realistic this is depends on how much capital you have to trade with. If you had a profitable strategy right now, how much would you be able to trade with?`, kb(PORTFOLIO_OPTS));
    return;
  }

  // PATH 2 — Lifestyle
  if (s === 'p2_portfolio') {
    await send(chatId, `Love the goal, ${u.name}. How much capital would you be able to trade with if you had a profitable strategy right now?`, kb(PORTFOLIO_OPTS));
    return;
  }

  if (s === 'p2_monthly_approach') {
    await send(chatId, `And realistically, how much would you need to make on a monthly basis from trading to achieve that?`, kb(['I have a specific number in mind','Never really thought about it','I just want to learn the skill for now']));
    return;
  }

  if (s === 'p2_monthly_specific') {
    await send(chatId, `What is the number?`);
    return;
  }

  // PATH 3 — Problem
  if (s === 'p3_wider') {
    await send(chatId, `Love that you're already aware of the problems you need to solve. But what's the wider goal of actually solving them?`, kb(['Make a bit of extra income each month','Replace my full-time job through trading','Maximise my savings']));
    return;
  }

  if (s === 'p3_portfolio') {
    await send(chatId, `Perfect, ${u.name}. How much capital would you be able to trade with if you had a profitable strategy right now?`, kb(PORTFOLIO_OPTS));
    return;
  }

  if (s === 'p3_monthly_approach') {
    const q = u.goalPath3Wider === 'Replace my full-time job through trading'
      ? `How much would you need to make per month to replace your full-time job?`
      : `How much extra would you like to make each month?`;
    await send(chatId, q, kb(['I have a specific number in mind','Never really thought about it','I just want to learn the skill for now']));
    return;
  }

  if (s === 'p3_monthly_specific') {
    await send(chatId, `What is the number?`);
    return;
  }

  if (s === 'bridge') {
    await send(chatId, bridgeMsg(u));
    await new Promise(r => setTimeout(r, 800));
    session.state = 'pain_profitable';
    await runState(chatId, session);
    return;
  }

  // SECTION 3 — Pain + Level
  if (s === 'pain_profitable') {
    await send(chatId, `Are you currently profitable in your trading?`, kb(['Yes, consistently','Sometimes — breaking even','No, I\'m losing money']));
    return;
  }

  if (s === 'pain_how_long') {
    const q = u.profitable === 'No, I\'m losing money' ? `How long have you been losing money?` : `How long have you been stuck at break even?`;
    await send(chatId, q, kb(['Less than 3 months','3–6 months','6–12 months','More than a year']));
    return;
  }

  if (s === 'pain_trajectory') {
    await send(chatId, `Over that time, has it been getting better, staying the same, or getting worse?`, kb(['Getting better','Staying the same','Getting worse']));
    return;
  }

  if (s === 'pain_confirm') {
    await send(chatId, `So if I'm understanding you correctly — you've been ${u.howLong.toLowerCase()} and things are getting worse. Is that right?`, kb(['Yes, that\'s right','Not exactly']));
    return;
  }

  if (s === 'pain_life_impact') {
    await send(chatId, `Has the struggle with trading affected other areas of your life?`, kb(['Yes, significantly','A little','Not really']));
    return;
  }

  if (s === 'level_experience') {
    await send(chatId, `How long have you been trading?`, kb(['Less than 6 months','6–12 months','1–2 years','More than 2 years']));
    return;
  }

  if (s === 'level_rules') {
    await send(chatId, `Do you have a clear written set of rules for when to enter and exit a trade?`, kb(['Yes, fully written','Rough idea, not written','No rules']));
    return;
  }

  if (s === 'level_journal') {
    await send(chatId, `Do you keep a trading journal?`, kb(['Yes, every trade','Sometimes','Never']));
    return;
  }

  if (s === 'level_stoploss') {
    await send(chatId, `Do you use a fixed stop loss on every trade?`, kb(['Always','Sometimes','Never']));
    return;
  }

  if (s === 'level_leverage') {
    await send(chatId, `Do you know how to use leverage correctly?`, kb(['Yes, I use it properly','Not sure I\'m doing it right','No / don\'t use it']));
    return;
  }

  if (s === 'generating') {
    await send(chatId, `Thanks ${u.name}. Give me a moment to put your assessment together...`);
    await generateReport(chatId, u);
    return;
  }
}

// ── TRANSITION LOGIC ──────────────────────────────────────
async function transition(chatId, session, value) {
  const u = session.data;
  const s = session.state;

  // Text inputs
  if (s === 'name') { u.name = value; session.state = 'goal'; }
  else if (s === 'goal') { u.goalRaw = value; session.state = 'goal_classify'; }
  else if (s === 'p2_monthly_specific') {
    u.goalMonthly = value;
    await send(chatId, feasibilityMsg(u.portfolio, u.goalMonthly));
    session.state = 'bridge';
  }
  else if (s === 'p3_monthly_specific') {
    u.goalMonthly = value;
    await send(chatId, feasibilityMsg(u.portfolio, u.goalMonthly));
    session.state = 'bridge';
  }

  // Button inputs
  else if (s === 'p1_portfolio') {
    u.portfolio = value; u.goalMonthly = u.goalRaw;
    await send(chatId, feasibilityMsg(u.portfolio, u.goalMonthly));
    session.state = 'bridge';
  }
  else if (s === 'p2_portfolio') { u.portfolio = value; session.state = 'p2_monthly_approach'; }
  else if (s === 'p2_monthly_approach') {
    if (value === 'I have a specific number in mind') { session.state = 'p2_monthly_specific'; }
    else { u.goalMonthly = value === 'Never really thought about it' ? 'none' : 'skill'; await send(chatId, feasibilityMsg(u.portfolio, u.goalMonthly)); session.state = 'bridge'; }
  }
  else if (s === 'p3_wider') { u.goalPath3Wider = value; session.state = 'p3_portfolio'; }
  else if (s === 'p3_portfolio') { u.portfolio = value; session.state = 'p3_monthly_approach'; }
  else if (s === 'p3_monthly_approach') {
    if (value === 'I have a specific number in mind') { session.state = 'p3_monthly_specific'; }
    else { u.goalMonthly = value === 'Never really thought about it' ? 'none' : 'skill'; await send(chatId, feasibilityMsg(u.portfolio, u.goalMonthly)); session.state = 'bridge'; }
  }
  else if (s === 'pain_profitable') {
    u.profitable = value;
    session.state = value !== 'Yes, consistently' ? 'pain_how_long' : 'level_experience';
  }
  else if (s === 'pain_how_long') { u.howLong = value; session.state = 'pain_trajectory'; }
  else if (s === 'pain_trajectory') {
    u.trajectory = value;
    session.state = value === 'Getting worse' ? 'pain_confirm' : 'pain_life_impact';
  }
  else if (s === 'pain_confirm') { session.state = 'pain_life_impact'; }
  else if (s === 'pain_life_impact') { u.lifeImpact = value; session.state = 'level_experience'; }
  else if (s === 'level_experience') { u.experience = value; session.state = 'level_rules'; }
  else if (s === 'level_rules') { u.rules = value; session.state = 'level_journal'; }
  else if (s === 'level_journal') { u.journal = value; session.state = 'level_stoploss'; }
  else if (s === 'level_stoploss') { u.stoploss = value; session.state = 'level_leverage'; }
  else if (s === 'level_leverage') { u.leverage = value; session.state = 'generating'; }

  await runState(chatId, session);
}

// ── GENERATE REPORT ───────────────────────────────────────
async function generateReport(chatId, u) {
  const prompt = `Trader profile:
Name: ${u.name}
Goal: ${u.goalRaw}${u.goalMonthly && u.goalMonthly !== 'none' && u.goalMonthly !== 'skill' ? ' (monthly target: '+u.goalMonthly+')' : ''}
Portfolio: ${u.portfolio}
Profitable: ${u.profitable}
${u.howLong ? 'Struggling for: '+u.howLong : ''}
${u.trajectory ? 'Trajectory: '+u.trajectory : ''}
${u.lifeImpact ? 'Life impact: '+u.lifeImpact : ''}
Experience: ${u.experience}
Written rules: ${u.rules}
Journal: ${u.journal}
Stop loss: ${u.stoploss}
Leverage: ${u.leverage}
Generate the full assessment.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:3000, system:SYS, messages:[{role:'user',content:prompt}] })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    const report = d.content[0].text.replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*/g,'').trim();
    const lvlMatch = report.match(/YOUR CURRENT LEVEL:\s*([^\n]+)/);
    const lvl = lvlMatch ? lvlMatch[1].trim() : 'Unknown';

    saveToSheets(u, lvl, report);

    const chunks = splitMessage(report);
    for (const chunk of chunks) {
      await send(chatId, chunk);
      await new Promise(r => setTimeout(r, 300));
    }

    const highValue = HIGH_VALUE.includes(u.portfolio);
    const cta = highValue
      ? `Thank you for getting this far, ${u.name}.\n\nI can tell you're committed to improving your trading and reaching ${u.goalRaw}. My team and I would like to offer you a free 1-on-1 consultation call. We'll run through your results, design a personal improvement plan, and give you our free trading journal.\n\n👉 Book your free call: [ADD YOUR LINK HERE]`
      : `You've taken the first step, ${u.name}.\n\nStart with the roadmap above. When you're ready to go faster, my team offers a free trading journal and consultation call.\n\n👉 Book your free call: [ADD YOUR LINK HERE]`;

    await send(chatId, cta);
    await send(chatId, `Type /start to begin a new assessment.`);
  } catch(e) {
    await send(chatId, `Something went wrong. Please type /start to try again.`);
    console.error(e);
  }
}

async function saveToSheets(u, level, report) {
  try {
    await fetch(SHEETS_URL, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name:u.name, telegram:u.telegram, goal:u.goalRaw, portfolio:u.portfolio, profitable:u.profitable, how_long_struggling:u.howLong, trajectory:u.trajectory, life_impact:u.lifeImpact, experience:u.experience, rules:u.rules, journal:u.journal, stoploss:u.stoploss, leverage:u.leverage, level, report })
    });
  } catch(e) { console.error('Sheets error:', e); }
}

// ── WEBHOOK ───────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });
  const update = req.body;

  try {
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      await answerCb(cb.id);
      const session = sessions[chatId];
      if (!session) { await send(chatId, 'Session expired. Type /start to begin.'); return res.status(200).json({ ok:true }); }
      await send(chatId, `✓ ${cb.data}`);
      await transition(chatId, session, cb.data);
      return res.status(200).json({ ok: true });
    }

    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const text = (msg.text || '').trim();

      if (text === '/start') {
        sessions[chatId] = newSession('@' + (msg.from.username || String(msg.from.id)));
        await runState(chatId, sessions[chatId]);
        return res.status(200).json({ ok: true });
      }

      const session = sessions[chatId];
      if (!session) { await send(chatId, 'Type /start to begin your assessment.'); return res.status(200).json({ ok:true }); }

      // Only accept text for text-input states
      const textStates = ['name','goal','p2_monthly_specific','p3_monthly_specific'];
      if (textStates.includes(session.state)) {
        await send(chatId, `✓ ${text}`);
        await transition(chatId, session, text);
      }
    }
  } catch(e) {
    console.error('Handler error:', e);
  }

  return res.status(200).json({ ok: true });
}
,'k per','per month','monthly','a month','a year','annually','profit','return','returns','make money','earn','income'];
  if (financialWords.some(w => t.includes(w))) return 'financial';
  if (lifestyleWords.some(w => t.includes(w))) return 'lifestyle';
  if (problemWords.some(w => t.includes(w))) return 'problem';
  return 'financial';
}

function feasibilityMsg(portfolio, monthly) {
  const mids = {'Less than $20k':10000,'$20k–$30k':25000,'$30k–$50k':40000,'$50k–$100k':75000,'$100k–$500k':300000,'$500k+':750000};
  const mid = mids[portfolio] || 10000;
  const fmt = n => n>=1000 ? '$'+(n/1000).toFixed(n%1000===0?0:1)+'k' : '$'+n;
  const lo = Math.round(mid*.05), hi = Math.round(mid*.10);
  if (!monthly || monthly === 'none') return `That's fine. In our experience, a profitable trader with a ${portfolio} portfolio can typically make ${fmt(lo)}–${fmt(hi)} per month.`;
  if (monthly === 'skill') return `Great — that's exactly how we believe you should be thinking at your current stage.`;
  const t = monthly.toLowerCase().replace(/,/g,'');
  let amt = null, m;
  if ((m=t.match(/\$?([\d.]+)\s*k/))) amt = parseFloat(m[1])*1000;
  else if ((m=t.match(/\$?([\d.]+)/))) amt = parseFloat(m[1]);
  if (!amt) return `In our experience, a profitable trader with a ${portfolio} portfolio can typically make ${fmt(lo)}–${fmt(hi)} per month.`;
  const pct = (amt/mid)*100;
  if (pct <= 10) return `Based on your portfolio size, that seems very realistic. A profitable trader with a ${portfolio} portfolio can typically make ${fmt(lo)}–${fmt(hi)} per month — right in line with your goal.`;
  return `Based on your portfolio size, that's an ambitious target. A profitable trader with a ${portfolio} portfolio can typically make ${fmt(lo)}–${fmt(hi)} per month. You'll need to grow both your edge and your capital together.`;
}

function bridgeMsg(u) {
  const raw = u.goalRaw.trim();
  const lower = raw.toLowerCase();
  let goalPhrase;
  if (lower.startsWith('i want to')) goalPhrase = lower.replace('i want to', 'you want to');
  else if (lower.startsWith('i want')) goalPhrase = lower.replace('i want', 'you want');
  else goalPhrase = `achieve: ${raw}`;
  return `Ok, got it — so ${goalPhrase}.\n\nTo do that, you need to eventually become a Level 4 trader. We'll start by identifying your current trader level.`;
}

function splitMessage(text, max = 4000) {
  const chunks = [];
  while (text.length > max) {
    let i = text.lastIndexOf('\n', max);
    if (i < 0) i = max;
    chunks.push(text.slice(0, i));
    text = text.slice(i).trim();
  }
  if (text) chunks.push(text);
  return chunks;
}

// ── TELEGRAM API ──────────────────────────────────────────
async function send(chatId, text, keyboard = null) {
  const body = { chat_id: chatId, text };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
}

async function answerCb(id) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ callback_query_id: id })
  });
}

function kb(options) {
  return options.map(o => [{ text: o, callback_data: o }]);
}

// ── STATE MACHINE ─────────────────────────────────────────
async function runState(chatId, session) {
  const u = session.data;
  const s = session.state;

  if (s === 'name') {
    await send(chatId, `Hi! I'm AI AK, my job is to help you understand:\n\n→ Why you're not where you want to be\n→ How to get where you want to go\n→ Give you the resources you need to get there\n\nFirst — what's your name?`);
    return;
  }

  if (s === 'goal') {
    await send(chatId, `Hey ${u.name}! I'm looking forward to helping you on your trading journey.\n\nWhat are your trading goals?`);
    return;
  }

  if (s === 'goal_classify') {
    u.goalPath = classifyGoal(u.goalRaw);
    if (u.goalPath === 'financial') session.state = 'p1_portfolio';
    else if (u.goalPath === 'lifestyle') session.state = 'p2_portfolio';
    else session.state = 'p3_wider';
    await runState(chatId, session);
    return;
  }

  // PATH 1 — Financial
  if (s === 'p1_portfolio') {
    await send(chatId, `Love the goal, ${u.name}. How realistic this is depends on how much capital you have to trade with. If you had a profitable strategy right now, how much would you be able to trade with?`, kb(PORTFOLIO_OPTS));
    return;
  }

  // PATH 2 — Lifestyle
  if (s === 'p2_portfolio') {
    await send(chatId, `Love the goal, ${u.name}. How much capital would you be able to trade with if you had a profitable strategy right now?`, kb(PORTFOLIO_OPTS));
    return;
  }

  if (s === 'p2_monthly_approach') {
    await send(chatId, `And realistically, how much would you need to make on a monthly basis from trading to achieve that?`, kb(['I have a specific number in mind','Never really thought about it','I just want to learn the skill for now']));
    return;
  }

  if (s === 'p2_monthly_specific') {
    await send(chatId, `What is the number?`);
    return;
  }

  // PATH 3 — Problem
  if (s === 'p3_wider') {
    await send(chatId, `Love that you're already aware of the problems you need to solve. But what's the wider goal of actually solving them?`, kb(['Make a bit of extra income each month','Replace my full-time job through trading','Maximise my savings']));
    return;
  }

  if (s === 'p3_portfolio') {
    await send(chatId, `Perfect, ${u.name}. How much capital would you be able to trade with if you had a profitable strategy right now?`, kb(PORTFOLIO_OPTS));
    return;
  }

  if (s === 'p3_monthly_approach') {
    const q = u.goalPath3Wider === 'Replace my full-time job through trading'
      ? `How much would you need to make per month to replace your full-time job?`
      : `How much extra would you like to make each month?`;
    await send(chatId, q, kb(['I have a specific number in mind','Never really thought about it','I just want to learn the skill for now']));
    return;
  }

  if (s === 'p3_monthly_specific') {
    await send(chatId, `What is the number?`);
    return;
  }

  if (s === 'bridge') {
    await send(chatId, bridgeMsg(u));
    await new Promise(r => setTimeout(r, 800));
    session.state = 'pain_profitable';
    await runState(chatId, session);
    return;
  }

  // SECTION 3 — Pain + Level
  if (s === 'pain_profitable') {
    await send(chatId, `Are you currently profitable in your trading?`, kb(['Yes, consistently','Sometimes — breaking even','No, I\'m losing money']));
    return;
  }

  if (s === 'pain_how_long') {
    const q = u.profitable === 'No, I\'m losing money' ? `How long have you been losing money?` : `How long have you been stuck at break even?`;
    await send(chatId, q, kb(['Less than 3 months','3–6 months','6–12 months','More than a year']));
    return;
  }

  if (s === 'pain_trajectory') {
    await send(chatId, `Over that time, has it been getting better, staying the same, or getting worse?`, kb(['Getting better','Staying the same','Getting worse']));
    return;
  }

  if (s === 'pain_confirm') {
    await send(chatId, `So if I'm understanding you correctly — you've been ${u.howLong.toLowerCase()} and things are getting worse. Is that right?`, kb(['Yes, that\'s right','Not exactly']));
    return;
  }

  if (s === 'pain_life_impact') {
    await send(chatId, `Has the struggle with trading affected other areas of your life?`, kb(['Yes, significantly','A little','Not really']));
    return;
  }

  if (s === 'level_experience') {
    await send(chatId, `How long have you been trading?`, kb(['Less than 6 months','6–12 months','1–2 years','More than 2 years']));
    return;
  }

  if (s === 'level_rules') {
    await send(chatId, `Do you have a clear written set of rules for when to enter and exit a trade?`, kb(['Yes, fully written','Rough idea, not written','No rules']));
    return;
  }

  if (s === 'level_journal') {
    await send(chatId, `Do you keep a trading journal?`, kb(['Yes, every trade','Sometimes','Never']));
    return;
  }

  if (s === 'level_stoploss') {
    await send(chatId, `Do you use a fixed stop loss on every trade?`, kb(['Always','Sometimes','Never']));
    return;
  }

  if (s === 'level_leverage') {
    await send(chatId, `Do you know how to use leverage correctly?`, kb(['Yes, I use it properly','Not sure I\'m doing it right','No / don\'t use it']));
    return;
  }

  if (s === 'generating') {
    await send(chatId, `Thanks ${u.name}. Give me a moment to put your assessment together...`);
    await generateReport(chatId, u);
    return;
  }
}

// ── TRANSITION LOGIC ──────────────────────────────────────
async function transition(chatId, session, value) {
  const u = session.data;
  const s = session.state;

  // Text inputs
  if (s === 'name') { u.name = value; session.state = 'goal'; }
  else if (s === 'goal') { u.goalRaw = value; session.state = 'goal_classify'; }
  else if (s === 'p2_monthly_specific') {
    u.goalMonthly = value;
    await send(chatId, feasibilityMsg(u.portfolio, u.goalMonthly));
    session.state = 'bridge';
  }
  else if (s === 'p3_monthly_specific') {
    u.goalMonthly = value;
    await send(chatId, feasibilityMsg(u.portfolio, u.goalMonthly));
    session.state = 'bridge';
  }

  // Button inputs
  else if (s === 'p1_portfolio') {
    u.portfolio = value; u.goalMonthly = u.goalRaw;
    await send(chatId, feasibilityMsg(u.portfolio, u.goalMonthly));
    session.state = 'bridge';
  }
  else if (s === 'p2_portfolio') { u.portfolio = value; session.state = 'p2_monthly_approach'; }
  else if (s === 'p2_monthly_approach') {
    if (value === 'I have a specific number in mind') { session.state = 'p2_monthly_specific'; }
    else { u.goalMonthly = value === 'Never really thought about it' ? 'none' : 'skill'; await send(chatId, feasibilityMsg(u.portfolio, u.goalMonthly)); session.state = 'bridge'; }
  }
  else if (s === 'p3_wider') { u.goalPath3Wider = value; session.state = 'p3_portfolio'; }
  else if (s === 'p3_portfolio') { u.portfolio = value; session.state = 'p3_monthly_approach'; }
  else if (s === 'p3_monthly_approach') {
    if (value === 'I have a specific number in mind') { session.state = 'p3_monthly_specific'; }
    else { u.goalMonthly = value === 'Never really thought about it' ? 'none' : 'skill'; await send(chatId, feasibilityMsg(u.portfolio, u.goalMonthly)); session.state = 'bridge'; }
  }
  else if (s === 'pain_profitable') {
    u.profitable = value;
    session.state = value !== 'Yes, consistently' ? 'pain_how_long' : 'level_experience';
  }
  else if (s === 'pain_how_long') { u.howLong = value; session.state = 'pain_trajectory'; }
  else if (s === 'pain_trajectory') {
    u.trajectory = value;
    session.state = value === 'Getting worse' ? 'pain_confirm' : 'pain_life_impact';
  }
  else if (s === 'pain_confirm') { session.state = 'pain_life_impact'; }
  else if (s === 'pain_life_impact') { u.lifeImpact = value; session.state = 'level_experience'; }
  else if (s === 'level_experience') { u.experience = value; session.state = 'level_rules'; }
  else if (s === 'level_rules') { u.rules = value; session.state = 'level_journal'; }
  else if (s === 'level_journal') { u.journal = value; session.state = 'level_stoploss'; }
  else if (s === 'level_stoploss') { u.stoploss = value; session.state = 'level_leverage'; }
  else if (s === 'level_leverage') { u.leverage = value; session.state = 'generating'; }

  await runState(chatId, session);
}

// ── GENERATE REPORT ───────────────────────────────────────
async function generateReport(chatId, u) {
  const prompt = `Trader profile:
Name: ${u.name}
Goal: ${u.goalRaw}${u.goalMonthly && u.goalMonthly !== 'none' && u.goalMonthly !== 'skill' ? ' (monthly target: '+u.goalMonthly+')' : ''}
Portfolio: ${u.portfolio}
Profitable: ${u.profitable}
${u.howLong ? 'Struggling for: '+u.howLong : ''}
${u.trajectory ? 'Trajectory: '+u.trajectory : ''}
${u.lifeImpact ? 'Life impact: '+u.lifeImpact : ''}
Experience: ${u.experience}
Written rules: ${u.rules}
Journal: ${u.journal}
Stop loss: ${u.stoploss}
Leverage: ${u.leverage}
Generate the full assessment.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:3000, system:SYS, messages:[{role:'user',content:prompt}] })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    const report = d.content[0].text.replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*/g,'').trim();
    const lvlMatch = report.match(/YOUR CURRENT LEVEL:\s*([^\n]+)/);
    const lvl = lvlMatch ? lvlMatch[1].trim() : 'Unknown';

    saveToSheets(u, lvl, report);

    const chunks = splitMessage(report);
    for (const chunk of chunks) {
      await send(chatId, chunk);
      await new Promise(r => setTimeout(r, 300));
    }

    const highValue = HIGH_VALUE.includes(u.portfolio);
    const cta = highValue
      ? `Thank you for getting this far, ${u.name}.\n\nI can tell you're committed to improving your trading and reaching ${u.goalRaw}. My team and I would like to offer you a free 1-on-1 consultation call. We'll run through your results, design a personal improvement plan, and give you our free trading journal.\n\n👉 Book your free call: [ADD YOUR LINK HERE]`
      : `You've taken the first step, ${u.name}.\n\nStart with the roadmap above. When you're ready to go faster, my team offers a free trading journal and consultation call.\n\n👉 Book your free call: [ADD YOUR LINK HERE]`;

    await send(chatId, cta);
    await send(chatId, `Type /start to begin a new assessment.`);
  } catch(e) {
    await send(chatId, `Something went wrong. Please type /start to try again.`);
    console.error(e);
  }
}

async function saveToSheets(u, level, report) {
  try {
    await fetch(SHEETS_URL, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name:u.name, telegram:u.telegram, goal:u.goalRaw, portfolio:u.portfolio, profitable:u.profitable, how_long_struggling:u.howLong, trajectory:u.trajectory, life_impact:u.lifeImpact, experience:u.experience, rules:u.rules, journal:u.journal, stoploss:u.stoploss, leverage:u.leverage, level, report })
    });
  } catch(e) { console.error('Sheets error:', e); }
}

// ── WEBHOOK ───────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });
  const update = req.body;

  try {
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      await answerCb(cb.id);
      const session = sessions[chatId];
      if (!session) { await send(chatId, 'Session expired. Type /start to begin.'); return res.status(200).json({ ok:true }); }
      await send(chatId, `✓ ${cb.data}`);
      await transition(chatId, session, cb.data);
      return res.status(200).json({ ok: true });
    }

    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const text = (msg.text || '').trim();

      if (text === '/start') {
        sessions[chatId] = newSession('@' + (msg.from.username || String(msg.from.id)));
        await runState(chatId, sessions[chatId]);
        return res.status(200).json({ ok: true });
      }

      const session = sessions[chatId];
      if (!session) { await send(chatId, 'Type /start to begin your assessment.'); return res.status(200).json({ ok:true }); }

      // Only accept text for text-input states
      const textStates = ['name','goal','p2_monthly_specific','p3_monthly_specific'];
      if (textStates.includes(session.state)) {
        await send(chatId, `✓ ${text}`);
        await transition(chatId, session, text);
      }
    }
  } catch(e) {
    console.error('Handler error:', e);
  }

  return res.status(200).json({ ok: true });
}
