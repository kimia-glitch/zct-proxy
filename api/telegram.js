const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
const SHEETS_URL     = 'https://script.google.com/macros/s/AKfycby6zh68MVuWCVCkyJv5vmfqCUebtib1DK8cjtbTDRUhqeWjmVAlOR955UXx0lNrlZsm8Q/exec';

// In-memory session store (resets on cold start, fine for MVP)
const sessions = {};

const SYS = `You are Koroush AK, founder of Zero Complexity Trading (ZCT). Your writing style is direct, warm, and plain. Short sentences. One idea at a time. No jargon. No over-explaining.

ZCT LEVELS:
0 — No Strategy: no journal, no routine, trading on gut or tips.
1 — Inconsistent Strategy: has some rules but doesn't follow them consistently.
2 — Consistent Strategy: follows rules 90%+ but equity flat/negative. No proven edge yet.
3 — Consistent & Profitable: positive expectancy over 30+ trades, upward equity curve.
4 — Consistent, Profitable & Scaled: multiple edges, profitable at meaningful size.

TONE: Direct, warm, specific to their answers. Short sentences. No waffle.
FORMAT: Plain text only. No markdown. No asterisks. No bullet points.

OUTPUT must begin with exactly: ZCT ASSESSMENT RESULTS

YOUR CURRENT LEVEL: [Level N — Full Name]
[2 sentences. What level and what it means for them.]

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
[2-3 short sentences. The one thing holding everything back. Specific to their answers.]

THE MOST COMMON MISTAKE AT YOUR LEVEL
[2-3 short sentences. The most common trap at this level. Tied to what they said.]

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
[One thing they can do today, in under an hour. Concrete and specific.]

WHERE YOU ARE AND WHERE YOU ARE GOING
[2-3 sentences. Honest, warm, grounded. Mention ZCT EV+ Program naturally. End on forward momentum.]`;

// ── FLOW DEFINITION ───────────────────────────────────────
const STEPS = [
  { key: 'name',       type: 'text',    msg: () => `Hi! I'm Koroush AK, founder of Zero Complexity Trading.\n\nMy job is to help you discover:\n→ Why you're not where you want to be\n→ How to get where you want to go\n→ The resources you need to get there\n\nFirst — what's your name?` },
  { key: 'goal',       type: 'text',    msg: (u) => `Great to meet you, ${u.name}!\n\nWhat's your main trading goal? How much do you want to make per month?` },
  { key: 'portfolio',  type: 'buttons', msg: () => `How much capital do you have available to trade with right now?`,
    options: ['Less than $5k', '$5k–$10k', '$10k–$20k', '$20k–$50k', '$50k+'] },
  { key: '_feasibility', type: 'info' }, // computed message, no input
  { key: 'profitable', type: 'buttons', msg: () => `Are you currently profitable in your trading?`,
    options: ['Yes, consistently', 'Sometimes / break even', 'No, losing money'] },
  { key: 'how_long',   type: 'buttons_conditional',
    condition: (u) => u.profitable !== 'Yes, consistently',
    msg: (u) => u.profitable === 'No, losing money' ? `How long have you been losing money?` : `How long have you been stuck at break even?`,
    options: ['Less than 3 months', '3–6 months', '6–12 months', 'More than a year'] },
  { key: 'trajectory', type: 'buttons_conditional',
    condition: (u) => u.how_long !== '',
    msg: () => `Over that time, has it been getting better, staying the same, or getting worse?`,
    options: ['Getting better', 'Staying the same', 'Getting worse'] },
  { key: 'experience', type: 'buttons', msg: () => `How long have you been trading overall?`,
    options: ['Less than 6 months', '6–12 months', '1–2 years', 'More than 2 years'] },
  { key: 'rules',      type: 'buttons', msg: () => `Do you have a clear written set of rules for when to enter and exit a trade?`,
    options: ['Yes, fully written', 'Rough idea, not written', 'No rules'] },
  { key: 'journal',    type: 'buttons', msg: () => `Do you keep a trading journal?`,
    options: ['Yes, every trade', 'Sometimes', 'Never'] },
  { key: 'stoploss',   type: 'buttons', msg: () => `Do you use a fixed stop loss on every trade?`,
    options: ['Always', 'Sometimes', 'Never'] },
  { key: 'leverage',   type: 'buttons', msg: () => `Do you know how to use leverage correctly?`,
    options: ['Yes, I use it properly', 'Not sure I\'m doing it right', 'No / don\'t use it'] },
];

// ── FEASIBILITY ───────────────────────────────────────────
function getFeasibility(u) {
  const mids = {'Less than $5k':3000,'$5k–$10k':7500,'$10k–$20k':15000,'$20k–$50k':35000,'$50k+':75000};
  const mid = mids[u.portfolio] || 10000;
  const t = (u.goal||'').toLowerCase().replace(/,/g,'');
  let amt = null, m;
  if ((m=t.match(/\$?([\d.]+)\s*k/))) amt = parseFloat(m[1])*1000;
  else if ((m=t.match(/\$?([\d.]+)/))) amt = parseFloat(m[1]);
  const fmt = n => n>=1000 ? '$'+(n/1000).toFixed(n%1000===0?0:1)+'k' : '$'+n;
  const lo = Math.round(mid*.05), hi = Math.round(mid*.10);
  let msg;
  if (!amt) msg = `With a ${u.portfolio} portfolio, a consistently profitable trader typically makes ${fmt(lo)}–${fmt(hi)} per month. Let's figure out what's standing between you and that.`;
  else {
    const pct = (amt/mid)*100;
    if (pct < 5)   msg = `That's exactly the right way to think at your stage. Conservative, process-focused targets are how the best traders build.`;
    else if (pct <= 10) msg = `That's realistic for a ${u.portfolio} portfolio. A profitable trader at that size typically makes ${fmt(lo)}–${fmt(hi)} per month — right in line with your goal.`;
    else msg = `That's ambitious for a ${u.portfolio} portfolio. A profitable trader at that size typically makes ${fmt(lo)}–${fmt(hi)} per month. You'll need to grow both your edge and capital together — it's doable.`;
  }
  return msg + `\n\nTo reach ${u.goal}, you need to eventually become a Level 4 trader. Let's find out where you are right now.`;
}

// ── TELEGRAM API ──────────────────────────────────────────
async function sendMessage(chatId, text, keyboard = null) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
}

async function answerCallback(callbackId) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ callback_query_id: callbackId })
  });
}

function makeKeyboard(options) {
  return options.map(o => [{ text: o, callback_data: o }]);
}

// ── SESSION HELPERS ───────────────────────────────────────
function newSession() {
  return { step: 0, data: { name:'', goal:'', portfolio:'', profitable:'', how_long:'', trajectory:'', experience:'', rules:'', journal:'', stoploss:'', leverage:'' } };
}

async function advance(chatId, session) {
  let stepIdx = session.step;
  while (stepIdx < STEPS.length) {
    const s = STEPS[stepIdx];
    // Skip conditional steps that don't apply
    if (s.type === 'buttons_conditional' && !s.condition(session.data)) {
      stepIdx++; continue;
    }
    // Handle feasibility info message
    if (s.type === 'info') {
      await sendMessage(chatId, getFeasibility(session.data));
      stepIdx++; continue;
    }
    // Send the next question
    session.step = stepIdx;
    const msg = s.msg(session.data);
    const kb = (s.type === 'buttons' || s.type === 'buttons_conditional') ? makeKeyboard(s.options) : null;
    await sendMessage(chatId, msg, kb);
    return;
  }
  // All steps done — generate report
  await sendMessage(chatId, `Thanks ${session.data.name}. Give me a moment to put your assessment together...`);
  await generateReport(chatId, session.data);
}

// ── GENERATE REPORT ───────────────────────────────────────
async function generateReport(chatId, d) {
  const prompt = `Trader profile:
Name: ${d.name}
Goal: ${d.goal}
Portfolio: ${d.portfolio}
Profitable: ${d.profitable}
${d.how_long ? 'Struggling for: ' + d.how_long : ''}
${d.trajectory ? 'Trajectory: ' + d.trajectory : ''}
Experience: ${d.experience}
Written rules: ${d.rules}
Journal: ${d.journal}
Stop loss: ${d.stoploss}
Leverage: ${d.leverage}

Generate the full assessment.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:3000, system:SYS, messages:[{role:'user',content:prompt}] })
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error.message);
    const report = data.content[0].text.replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*/g,'').trim();

    // Extract level
    const lvlMatch = report.match(/YOUR CURRENT LEVEL:\s*([^\n]+)/);
    const lvl = lvlMatch ? lvlMatch[1].trim() : 'Unknown';

    // Save to sheets
    saveToSheets(d, lvl, report);

    // Send report in chunks (Telegram 4096 char limit)
    const chunks = splitMessage(report);
    for (const chunk of chunks) {
      await sendMessage(chatId, chunk);
      await new Promise(res => setTimeout(res, 300));
    }

    // CTA
    const highValue = ['$20k–$50k','$50k+'].includes(d.portfolio);
    const cta = highValue
      ? `Thank you for getting this far, ${d.name}. I can tell you're committed to improving your trading.\n\nMy team and I would like to offer you a free 1-on-1 consultation call. We'll run through your results, design a personal plan, and give you our free trading journal.\n\n👉 Book your free call: [ADD YOUR LINK HERE]`
      : `You've taken the first step, ${d.name}.\n\nStart with the roadmap above. When you're ready to go faster, we offer a free trading journal and consultation call.\n\n👉 Get your free journal: [ADD YOUR LINK HERE]`;
    await sendMessage(chatId, cta);

    // Restart option
    await sendMessage(chatId, `Type /start to begin a new assessment.`);

  } catch(e) {
    await sendMessage(chatId, `Something went wrong. Please type /start to try again.`);
    console.error(e);
  }
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

async function saveToSheets(d, level, report) {
  try {
    await fetch(SHEETS_URL, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name:d.name, telegram:d.telegram||'', goal:d.goal, portfolio:d.portfolio, profitable:d.profitable, how_long_struggling:d.how_long, trajectory:d.trajectory, experience:d.experience, rules:d.rules, journal:d.journal, stoploss:d.stoploss, leverage:d.leverage, level, report })
    });
  } catch(e) { console.error('Sheets error:', e); }
}

// ── WEBHOOK HANDLER ───────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });
  const update = req.body;

  try {
    // Callback query (button press)
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const value = cb.data;
      await answerCallback(cb.id);
      const session = sessions[chatId] || newSession();
      const s = STEPS[session.step];
      if (s && (s.type === 'buttons' || s.type === 'buttons_conditional')) {
        session.data[s.key] = value;
        await sendMessage(chatId, `✓ ${value}`);
        session.step++;
        sessions[chatId] = session;
        await advance(chatId, session);
      }
      return res.status(200).json({ ok: true });
    }

    // Text message
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const text = (msg.text || '').trim();

      if (text === '/start' || !sessions[chatId]) {
        sessions[chatId] = newSession();
        sessions[chatId].data.telegram = '@' + (msg.from.username || msg.from.id);
        await advance(chatId, sessions[chatId]);
        return res.status(200).json({ ok: true });
      }

      const session = sessions[chatId];
      const s = STEPS[session.step];
      if (s && s.type === 'text') {
        session.data[s.key] = text;
        session.step++;
        sessions[chatId] = session;
        await advance(chatId, session);
      }
    }
  } catch(e) {
    console.error('Handler error:', e);
  }

  return res.status(200).json({ ok: true });
}
