import {
  defaults,
  foods,
  keys,
  mealTypes,
  normalizeArabic,
  total,
  dateKey,
  calculateTargets,
  validBackup
} from './nutrition.js';

const $ = s => document.querySelector(s);
const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = v => Math.round(v).toLocaleString('ar-EG');

function defaultState() {
  return {
    version: 1,
    profile: { ...defaults },
    entries: [],
    supplements: [],
    customFoods: [],
    water: {},
    suppLogs: {}
  };
}

function hydrateState(parsed) {
  return {
    version: 1,
    profile: { ...defaults, ...parsed.profile },
    entries: parsed.entries || [],
    supplements: parsed.supplements || [],
    customFoods: parsed.customFoods || [],
    water: parsed.water || {},
    suppLogs: parsed.suppLogs || {}
  };
}

let state = defaultState();
let storageError = false;

try {
  const saved = localStorage.getItem('akly');
  if (saved) {
    const parsed = JSON.parse(saved);
    if (validBackup(parsed)) {
      state = hydrateState(parsed);
    } else {
      storageError = true;
    }
  }
} catch {
  storageError = true;
}

let tab = 'today';
let day = dateKey();
let search = '';
let category = 'الكل';

function toast(t) {
  $('#toast').textContent = t;
  $('#toast').style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($('#toast').style.display = 'none'), 4000);
}

function save() {
  try {
    localStorage.setItem('akly', JSON.stringify(state));
    return true;
  } catch {
    toast('تعذر الحفظ على الجهاز. صدّر نسخة احتياطية قبل الإغلاق.');
    return false;
  }
}

function go(t) {
  tab = t;
  render();
  window.scrollTo(0, 0);
}

const entries = () => state.entries.filter(e => e.date === day);
const allFoods = () => [...state.customFoods, ...foods];

function prevDateKey(currDateStr) {
  const [y, m, d] = currDateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return dateKey(dt);
}

function heading(title, sub, action = '') {
  return `<div class="heading"><div><h1>${title}</h1><p class="muted">${sub}</p></div>${action}</div>`;
}

function render() {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#view').innerHTML = { today, foods: catalog, insights, settings }[tab]();
  bind();
}

function today() {
  const dayEntries = entries();
  const t = total(dayEntries);
  const p = state.profile;
  const pct = Math.min(100, (t.calories / p.calories) * 100);
  const waterCount = Number(state.water[day] || 0);
  const waterGoal = Number(p.waterGoal || 8);
  const takenSupps = state.suppLogs[day] || [];
  const yesterdayKey = prevDateKey(day);
  const yesterdayEntries = state.entries.filter(e => e.date === yesterdayKey);

  // تجميع الوجبات حسب النوع (فطار، غدا، عشا، سناك)
  const groupedMealsHtml = mealTypes
    .map(mType => {
      const mList = dayEntries.filter(e => e.meal === mType);
      if (!mList.length) return '';
      const mCals = mList.reduce((sum, e) => sum + e.food.calories * e.quantity, 0);
      return `<div class="meal-group">
        <div class="meal-group-header">
          <span>${esc(mType)}</span>
          <small>${n(mCals)} سعرة</small>
        </div>
        ${mList
          .map(
            e => `<div class="row meal">
            <div class="emoji">${esc(e.food.emoji || '🍽️')}</div>
            <div class="meal-info">
              <h3>${esc(e.food.name)}</h3>
              <small>${e.quantity.toLocaleString('ar-EG')} حصة · ${esc(e.food.portion || 'حصة مخصصة')}</small>
            </div>
            <b>${n(e.food.calories * e.quantity)} <small>سعرة</small></b>
            <div class="meal-actions">
              <button class="text-button" title="تعديل الكمية أو الوجبة" aria-label="تعديل ${esc(e.food.name)}" data-edit-entry="${esc(e.id)}">✎</button>
              <button class="text-button" title="حذف" aria-label="حذف ${esc(e.food.name)}" data-delete="${esc(e.id)}">×</button>
            </div>
          </div>`
          )
          .join('')}
      </div>`;
    })
    .join('');

  return (
    heading(
      `يومك بتوازن${p.name ? '، ' + esc(p.name) : ''} 🌿`,
      'كل وجبة بتسجلها، بتخليك فاهم أكلك أكتر.',
      `<input aria-label="تاريخ اليوميات" class="date" type="date" id="day" value="${day}">`
    ) +
    `<section class="hero">
      <div>
        <span class="pill">خطوة حلوة لصحتك</span>
        <h2>أكلك جزء من يومك.<br>خلّيه مناسب ليك.</h2>
        <p class="muted">${
          dayEntries.length
            ? 'سجلت ' + n(dayEntries.length) + ' وجبات في اليوم ده. الأرقام بتساعدك تتابع، مش بتحكم على يومك.'
            : 'ابدأ بأول وجبة، حتى لو كانت ساندوتش على السريع.'
        }</p>
      </div>
      <div class="ring" style="--pct:${pct}%">
        <div><b>${n(t.calories)}</b><small>من ${n(p.calories)} سعرة</small></div>
      </div>
    </section>

    <div class="stats">
      ${[
        ['protein', 'البروتين'],
        ['carbs', 'الكربوهيدرات'],
        ['fat', 'الدهون'],
        ['fiber', 'الألياف']
      ]
        .map(
          ([k, l]) => `<div class="card stat">
          <small>${l}</small>
          <b>${n(t[k])} <small>جم</small></b>
          <progress aria-label="${l}" value="${Math.min(t[k], p[k])}" max="${p[k]}"></progress>
          <small>هدفك ${n(p[k])} جم</small>
        </div>`
        )
        .join('')}
    </div>

    <div class="columns">
      <section class="card">
        <div class="row">
          <h2>وجباتك النهارده</h2>
          <div class="actions">
            ${
              !dayEntries.length && yesterdayEntries.length
                ? `<button class="secondary" id="copy-yesterday">↻ نسخ وجبات امبارح (${n(yesterdayEntries.length)})</button>`
                : ''
            }
            <button class="primary" data-go="foods">＋ أضف وجبة</button>
          </div>
        </div>
        ${
          dayEntries.length
            ? groupedMealsHtml
            : '<div class="empty">🍽️<p>لسه مفيش وجبات مسجلة.<br>الفول والطعمية والكشري والمحشي موجودين هنا.</p></div>'
        }
        <p class="muted">قيم الأكلات الجاهزة تقديرية؛ الزيت وحجم الحصة والوصفة بيغيّروا الحساب. اضغط ✎ لتعديل الحصة.</p>
      </section>

      <div class="side-stack">
        <section class="card">
          <div class="row">
            <h2>شرب المية 💧</h2>
            <span class="pill">${n(waterCount * 250)} مل</span>
          </div>
          <p class="muted">الترطيب وسط الشغل بيفرق في تركيزك وطاقتك. الكوب ≈ 250 مل.</p>
          <div class="water-row">
            <button class="secondary water-btn" id="water-minus" aria-label="إنقاص كوب ماء" ${waterCount <= 0 ? 'disabled' : ''}>−</button>
            <div class="water-status">
              <b>${n(waterCount)} <small>/ ${n(waterGoal)} أكواب</small></b>
              <progress aria-label="شرب الماء" value="${Math.min(waterCount, waterGoal)}" max="${waterGoal}"></progress>
            </div>
            <button class="primary water-btn" id="water-plus" aria-label="إضافة كوب ماء">＋ كوب</button>
          </div>
        </section>

        ${
          state.supplements.length
            ? `<section class="card">
                <div class="row">
                  <h2>مكملات اليوم 💊</h2>
                  <small class="muted">${n(takenSupps.length)} من ${n(state.supplements.length)}</small>
                </div>
                <div class="supp-checklist">
                  ${state.supplements
                    .map(s => {
                      const checked = takenSupps.includes(s.id);
                      return `<label class="check supp-item ${checked ? 'done' : ''}">
                        <input type="checkbox" data-toggle-supp="${esc(s.id)}" ${checked ? 'checked' : ''}>
                        <div>
                          <b>${esc(s.name)}</b>
                          <small class="muted">${esc(s.note)}</small>
                        </div>
                      </label>`;
                    })
                    .join('')}
                </div>
              </section>`
            : ''
        }

        <section class="card">
          <h2>وسط يوم الشغل ☀️</h2>
          <p class="muted">${esc(p.work)} · ${esc(p.start)} – ${esc(p.end)}<br>أكلك غالبًا: ${esc(p.source)}</p>
          <div class="callout">${
            p.source.includes('بيت')
              ? 'جهّز وجبة سهلة من البيت قبل بداية الشغل، وسجل الكمية الفعلية.'
              : 'لو هتاكل بره: اختار مصدر بروتين، وزوّد سلطة أو خضار. اطلب الصوص منفصل عشان تقدر كمية الإضافات.'
          }</div>
          <p class="muted">${
            t.fiber < p.fiber
              ? 'الألياف المسجلة أقل من هدفك. فول، عدس، خضار أو ثمرة فاكهة ممكن يساعدوا حسب المناسب ليك.'
              : 'وصلت لهدف الألياف المسجل. كمل تنويع أكلك حسب احتياجك.'
          }</p>
          <button class="secondary" id="calendar">أضف تذكير ${esc(p.reminder)} للتقويم</button>
          <div class="install">على الآيفون: افتح رابط التطبيق في Safari ← مشاركة ← إضافة إلى الشاشة الرئيسية. يشتغل بدون إنترنت بعد أول فتح ناجح.</div>
        </section>
      </div>
    </div>`
  );
}

function catalog() {
  const q = normalizeArabic(search);
  const list = allFoods().filter(f => {
    const matchCat =
      category === 'الكل' ||
      (category === 'أكلاتي' ? f.custom : f.category === category);
    const matchSearch =
      !q ||
      normalizeArabic(f.name).includes(q) ||
      normalizeArabic(f.portion).includes(q);
    return matchCat && matchSearch;
  });

  return (
    heading(
      'هنا تبدأ وجبتك',
      'أكلات مصرية بنحبها، وحساب تقريبي واضح.',
      `<button class="primary" id="custom">＋ أكلة مخصصة</button>`
    ) +
    `<div class="filters">
      <input id="search" placeholder="دور على فول، كشري، محشي، شاورما، جبنة…" aria-label="ابحث عن أكلة" value="${esc(search)}">
      <select id="category" aria-label="نوع الأكل">
        ${['الكل', 'أكلاتي', 'فطار', 'غدا', 'سناك', 'إضافات']
          .map(c => `<option value="${c}" ${c === category ? 'selected' : ''}>${c === 'أكلاتي' ? '★ أكلاتي المخصصة' : c}</option>`)
          .join('')}
      </select>
    </div>
    <p class="muted">قائمة تضم ${n(allFoods().length)} أكلة شائعة ومخصصة، وليست بيانات معتمدة لسلاسل مطاعم بعينها. اضبط الحصة أو أدخل أرقام الملصق الغذائي.</p>
    <div class="foods">
      ${
        list
          .map(
            f => `<article class="card food">
            <div class="row">
              <div class="emoji">${esc(f.emoji || '🍽️')}</div>
              <div class="row">
                <span class="pill">${f.custom ? 'أكلتي ★' : 'تقديري'}</span>
                ${
                  f.custom
                    ? `<button class="text-button" title="حذف من أكلاتي" aria-label="حذف ${esc(f.name)}" data-delete-custom="${esc(f.id)}">×</button>`
                    : ''
                }
              </div>
            </div>
            <h3>${esc(f.name)}</h3>
            <small class="muted">${esc(f.portion)}</small>
            <div><b>${n(f.calories)}</b> <small class="muted">سعرة / حصة</small></div>
            <small class="muted">بروتين ${n(f.protein)} جم · كارب ${n(f.carbs)} جم · دهون ${n(f.fat)} جم · ألياف ${n(f.fiber)} جم</small>
            <button class="secondary" data-food="${esc(f.id)}">＋ سجل الوجبة</button>
          </article>`
          )
          .join('') || '<p class="empty wide">مش موجودة في البحث؟ اضغط «＋ أكلة مخصصة» فوق وضيفها لقاعدتك.</p>'
      }
    </div>`
  );
}

function showFood(id, editEntryId = null) {
  const existingEntry = editEntryId ? state.entries.find(e => e.id === editEntryId) : null;
  const f = existingEntry ? existingEntry.food : allFoods().find(x => x.id === id);
  const custom = !f;
  const defaultMeal = existingEntry
    ? existingEntry.meal
    : f && mealTypes.includes(f.category)
    ? f.category
    : 'غدا';
  const defaultQty = existingEntry ? existingEntry.quantity : 1;
  const defaultDate = existingEntry ? existingEntry.date : day;

  $('#food-dialog').innerHTML = `<form id="add-food">
    <div class="row">
      <h2>${existingEntry ? 'تعديل: ' + esc(f.name) : custom ? 'أكلة جديدة من عندك' : esc(f.name)}</h2>
      <button type="button" class="text-button" id="close-dialog" aria-label="إغلاق">×</button>
    </div>
    ${
      custom
        ? `<label>اسم الأكلة<input name="name" required maxlength="80" placeholder="مثلًا: سندوتش كفتة بيتي"></label>
           <div class="form-grid">
             <label>وصف الحصة<input name="portion" required placeholder="مثلًا: رغيف 180 جم" maxlength="80"></label>
             <label>تصنيف الأكلة<select name="category"><option>فطار</option><option selected>غدا</option><option>سناك</option><option>إضافات</option></select></label>
           </div>
           <p class="muted">أدخل القيم لكل حصة من الملصق أو مصدر موثوق. ستُحفظ الأكلة تلقائيًا في قسم «أكلاتي ★» لاستخدامها لاحقًا.</p>
           <div class="form-grid">
             ${keys
               .map(
                 (k, i) =>
                   `<label>${['السعرات', 'البروتين (جم)', 'الكربوهيدرات (جم)', 'الدهون (جم)', 'الألياف (جم)'][i]}<input required name="${k}" type="number" min="0" max="10000" step="0.1"></label>`
               )
               .join('')}
           </div>`
        : `<p class="muted">${esc(f.portion)} · ${n(f.calories)} سعرة للحصة (${n(f.protein)}ب · ${n(f.carbs)}ك · ${n(f.fat)}د)<br>${
            f.custom ? 'محفوظة في أكلاتك المخصصة.' : 'تقدير أولي غير معتمد من مطعم.'
          }</p>`
    }
    <div class="form-grid">
      <label>عدد الحصص<input name="quantity" type="number" value="${defaultQty}" min="0.1" max="20" step="0.1" required></label>
      <label>الوجبة<select name="meal">${mealTypes
        .map(m => `<option ${m === defaultMeal ? 'selected' : ''}>${m}</option>`)
        .join('')}</select></label>
    </div>
    <label>التاريخ<input name="date" type="date" value="${defaultDate}" required></label>
    <button class="primary" type="submit">${existingEntry ? 'حفظ التعديل' : 'حفظ الوجبة'}</button>
  </form>`;

  $('#food-dialog').showModal();
  $('#close-dialog').onclick = () => $('#food-dialog').close();

  $('#add-food').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);

    if (existingEntry) {
      existingEntry.quantity = Number(fd.get('quantity'));
      existingEntry.meal = fd.get('meal');
      existingEntry.date = fd.get('date');
      day = existingEntry.date;
      const ok = save();
      $('#food-dialog').close();
      go('today');
      if (ok) toast('تم تعديل الوجبة ✓');
      return;
    }

    let food = f;
    if (!food) {
      const name = fd.get('name').trim();
      if (!name) return;
      food = {
        id: 'c-' + crypto.randomUUID(),
        name,
        portion: fd.get('portion').trim(),
        category: fd.get('category') || 'غدا',
        emoji: '🍽️',
        estimated: false,
        custom: true,
        ...Object.fromEntries(keys.map(k => [k, Number(fd.get(k))]))
      };
      state.customFoods.unshift(food);
    }

    state.entries.push({
      id: crypto.randomUUID(),
      food,
      quantity: Number(fd.get('quantity')),
      meal: fd.get('meal'),
      date: fd.get('date')
    });
    day = fd.get('date');
    const ok = save();
    $('#food-dialog').close();
    go('today');
    if (ok) toast(custom ? 'اتسجلت الوجبة واتحفظت في أكلاتك ✓' : 'اتسجلت وجبتك ✓');
  };
}

function insights() {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const key = dateKey(d);
    const list = state.entries.filter(e => e.date === key);
    const waterCups = Number(state.water[key] || 0);
    return {
      key,
      label: d.toLocaleDateString('ar-EG', { weekday: 'short' }),
      count: list.length,
      waterCups,
      ...total(list)
    };
  });
  const logged = days.filter(d => d.count);
  const avgFiber = logged.length ? logged.reduce((s, d) => s + d.fiber, 0) / logged.length : 0;
  const avgProtein = logged.length ? logged.reduce((s, d) => s + d.protein, 0) / logged.length : 0;
  const max = Math.max(1, ...days.map(d => d.calories));

  return (
    heading('صورة أوضح لأسبوعك', 'آخر ٧ أيام · المتابعة من تسجيلاتك فقط') +
    `<div class="columns section">
      <section class="card">
        <h2>السعرات المسجلة</h2>
        <div class="week">
          ${days
            .map(
              d => `<div class="day">
              <span>${d.count ? n(d.calories) : '—'}</span>
              <div class="bar" style="height:${(d.calories / max) * 105}px"></div>
              ${d.label}
            </div>`
            )
            .join('')}
        </div>
        <p class="muted">${n(logged.length)} أيام فيها تسجيل. اليوم غير المسجل لا يعني أنك لم تأكل، والمتوسط لا يقيس كفاية تغذيتك.</p>
      </section>
      <section class="card">
        <h2>متوسط البروتين والألياف</h2>
        <div class="form-grid">
          <div>
            <small class="muted">البروتين / يوم مسجل</small>
            <h1>${n(avgProtein)} <small class="muted">جم</small></h1>
            <small class="muted">الهدف: ${n(state.profile.protein)} جم</small>
          </div>
          <div>
            <small class="muted">الألياف / يوم مسجل</small>
            <h1>${n(avgFiber)} <small class="muted">جم</small></h1>
            <small class="muted">الهدف: ${n(state.profile.fiber)} جم</small>
          </div>
        </div>
        <p class="muted">${
          logged.length
            ? 'نوّع بين البقول والخضار والفاكهة والحبوب الكاملة ومصادر البروتين.'
            : 'سجل وجباتك عشان تظهر المتابعة.'
        }</p>
        <div class="callout">المغذيات الدقيقة زي الحديد والكالسيوم وفيتامين D مش متوفرة في قاعدة البداية. مفيش استنتاج لنقصها أو احتياج مكمل من الأرقام دي.</div>
      </section>
    </div>
    <section class="card">
      <h2>مكملاتي</h2>
      <p class="muted">سجّل المكملات اللي اتفقت عليها مع طبيبك أو الصيدلي، وعلّم عليها يوميًا في صفحة «يومي». التطبيق لا يحدد مكملات لازمة أو جرعات، خصوصًا مع أدوية أو أمراض مزمنة.</p>
      ${state.supplements
        .map(
          s => `<div class="row supp">
          <div><h3>${esc(s.name)}</h3><small class="muted">${esc(s.note)}</small></div>
          <button class="text-button" data-remove-supp="${esc(s.id)}" aria-label="حذف المكمل">حذف</button>
        </div>`
        )
        .join('')}
      <form id="supp-form" class="form-grid">
        <label>اسم المكمل<input name="name" required maxlength="80" placeholder="حسب توصية المختص"></label>
        <label>تعليمات المختص أو موعده<input name="note" required maxlength="160" placeholder="مثلًا: قرص بعد الغداء"></label>
        <div><button class="secondary">＋ حفظ المكمل</button></div>
      </form>
    </section>`
  );
}

function settings() {
  const p = state.profile;
  return (
    heading('مناسب ليك، وليومك', 'عدّل شغلك، أهدافك ومواعيدك في أي وقت.') +
    `<section class="card section">
      <div class="row">
        <div>
          <h2>حاسبة الاحتياج التقريبي 🧮</h2>
          <p class="muted">مش عارف تحدد أهدافك؟ احسب تقدير مبدئي (معادلة Mifflin-St Jeor) وعدّله براحتك أو مع مختص.</p>
        </div>
      </div>
      <form id="calc-form" class="form-grid">
        <label>النوع
          <select name="gender">
            <option value="male">ذكر</option>
            <option value="female">أنثى</option>
          </select>
        </label>
        <label>السن (سنة)<input type="number" name="age" min="15" max="100" value="30" required></label>
        <label>الوزن (كجم)<input type="number" name="weight" min="35" max="250" step="0.5" value="75" required></label>
        <label>الطول (سم)<input type="number" name="height" min="120" max="230" value="170" required></label>
        <label>النشاط اليومي
          <select name="activity">
            <option value="sedentary">مكتبي / حركة قليلة</option>
            <option value="light" selected>حركة خفيفة / مشي بسيط</option>
            <option value="moderate">شغل ميداني / تمرين 3-4 أيام</option>
            <option value="active">مجهود بدني عالي يوميًا</option>
          </select>
        </label>
        <label>الهدف
          <select name="goal">
            <option value="maintain" selected>الحفاظ على الوزن وتنظيم الأكل</option>
            <option value="lose">نزول تدريجي في الوزن</option>
            <option value="gain">زيادة الوزن / الكتلة العضلية</option>
          </select>
        </label>
        <div class="wide"><button type="submit" class="secondary">احسب واملأ الأهداف بالأسفل ↓</button></div>
      </form>
    </section>

    <form id="settings-form">
      <section class="card section">
        <h2>يومك عامل إزاي؟</h2>
        <div class="form-grid">
          ${[
            ['name', 'اسمك', 'text'],
            ['work', 'طبيعة الشغل', 'text'],
            ['source', 'أكلك غالبًا منين؟', 'text'],
            ['start', 'بداية الشغل', 'time'],
            ['end', 'نهاية الشغل', 'time'],
            ['reminder', 'موعد متابعة الأكل والمكملات', 'time']
          ]
            .map(
              ([k, l, type]) =>
                `<label>${l}<input name="${k}" type="${type}" value="${esc(p[k])}" ${k === 'name' ? '' : 'required'} maxlength="100"></label>`
            )
            .join('')}
        </div>
      </section>
      <section class="card section">
        <h2>أهدافك اليومية</h2>
        <p class="muted">قيم البداية أمثلة قابلة للتعديل للبالغين، وليست احتياجات طبية ملزمة. الألياف 25 جم إرشاد عام من WHO.</p>
        <div class="form-grid">
          ${[...keys, 'waterGoal']
            .map(
              (k, i) =>
                `<label>${
                  ['السعرات', 'البروتين (جم)', 'الكربوهيدرات (جم)', 'الدهون (جم)', 'الألياف (جم)', 'أكواب الماء (250 مل)'][i]
                }<input type="number" id="goal-${k}" name="${k}" min="1" max="${k === 'calories' ? 10000 : k === 'waterGoal' ? 30 : 1000}" step="1" required value="${p[k] || defaults[k]}"></label>`
            )
            .join('')}
        </div>
        <button class="primary">حفظ الإعدادات</button>
      </section>
    </form>

    <section class="card section">
      <h2>التذكيرات والخصوصية</h2>
      <p class="muted">نزّل تذكيرًا يوميًا وأضفه لتطبيق تقويم يدعم ملفات ICS. لو Safari لم يضفه مباشرة، افتح الملف من تطبيق تقويم على الكمبيوتر المتزامن مع الآيفون. راجع التنبيه داخل التقويم. الإشعارات التلقائية من PWA وهو مغلق تحتاج خادم Push، وهي غير مفعلة هنا. تغيير الموعد هنا لا يعدل حدث التقويم القديم؛ احذفه وأضف الجديد.</p>
      <button id="calendar" class="secondary">تنزيل تذكير يومي للتقويم</button>
      <p class="muted">السجل محفوظ داخل المتصفح على الجهاز فقط؛ مسح بيانات المتصفح يمسحه. مفيش حساب أو مزامنة. نسخة التصدير تحتوي بياناتك الشخصية، احتفظ بيها بعيدًا عن GitHub.</p>
      <div class="actions">
        <button id="export" class="secondary">تصدير بياناتي</button>
        <button id="import" class="secondary">استرجاع نسخة</button>
        <button id="reset" class="danger">مسح بياناتي</button>
      </div>
      <input id="import-file" type="file" accept="application/json,.json" hidden>
    </section>`
  );
}

function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function calendar() {
  const [h, m] = state.profile.reminder.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d < new Date()) d.setDate(d.getDate() + 1);
  const dt =
    dateKey(d).replaceAll('-', '') +
    'T' +
    String(h).padStart(2, '0') +
    String(m).padStart(2, '0') +
    '00';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Akly//AR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:akly-daily-' + crypto.randomUUID() + '@local',
    'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
    'DTSTART:' + dt,
    'DURATION:PT10M',
    'RRULE:FREQ=DAILY',
    'SUMMARY:متابعة أكلي اليومية',
    'DESCRIPTION:سجل وجباتك وراجع مكملاتك حسب تعليمات المختص.',
    'BEGIN:VALARM',
    'TRIGGER:PT0S',
    'ACTION:DISPLAY',
    'DESCRIPTION:وقت متابعة أكلي',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  download(lines.join('\r\n') + '\r\n', 'akly-reminder.ics', 'text/calendar;charset=utf-8');
  toast('أضف الملف لتقويمك وراجع إعداد التنبيه');
}

function bind() {
  document.querySelectorAll('[data-go]').forEach(b => (b.onclick = () => go(b.dataset.go)));
  if ($('#day')) {
    $('#day').onchange = e => {
      if (e.target.value) {
        day = e.target.value;
        render();
      }
    };
  }
  document.querySelectorAll('[data-food]').forEach(b => (b.onclick = () => showFood(b.dataset.food)));
  document.querySelectorAll('[data-edit-entry]').forEach(b => (b.onclick = () => showFood(null, b.dataset.editEntry)));
  document.querySelectorAll('[data-delete]').forEach(
    b =>
      (b.onclick = () => {
        state.entries = state.entries.filter(e => e.id !== b.dataset.delete);
        save();
        render();
      })
  );
  document.querySelectorAll('[data-delete-custom]').forEach(
    b =>
      (b.onclick = () => {
        if (confirm('حذف هذه الأكلة من قائمتك المخصصة؟ (لن تُحذف من الأيام المسجلة سابقًا)')) {
          state.customFoods = state.customFoods.filter(f => f.id !== b.dataset.deleteCustom);
          save();
          render();
        }
      })
  );
  if ($('#copy-yesterday')) {
    $('#copy-yesterday').onclick = () => {
      const yKey = prevDateKey(day);
      const yEntries = state.entries.filter(e => e.date === yKey);
      if (!yEntries.length) return;
      yEntries.forEach(e => {
        state.entries.push({
          ...e,
          id: crypto.randomUUID(),
          date: day
        });
      });
      save();
      render();
      toast('تم نسخ وجبات امبارح لليوم ✓');
    };
  }
  if ($('#water-plus')) {
    $('#water-plus').onclick = () => {
      state.water[day] = Number(state.water[day] || 0) + 1;
      save();
      render();
    };
  }
  if ($('#water-minus')) {
    $('#water-minus').onclick = () => {
      const curr = Number(state.water[day] || 0);
      if (curr > 0) {
        state.water[day] = curr - 1;
        save();
        render();
      }
    };
  }
  document.querySelectorAll('[data-toggle-supp]').forEach(
    chk =>
      (chk.onchange = () => {
        const sId = chk.dataset.toggleSupp;
        const curr = new Set(state.suppLogs[day] || []);
        if (chk.checked) curr.add(sId);
        else curr.delete(sId);
        state.suppLogs[day] = [...curr];
        save();
        render();
      })
  );
  if ($('#custom')) $('#custom').onclick = () => showFood();
  if ($('#search')) {
    $('#search').oninput = e => {
      const pos = e.target.selectionStart;
      search = e.target.value;
      render();
      $('#search').focus();
      $('#search').setSelectionRange(pos, pos);
    };
  }
  if ($('#category')) {
    $('#category').onchange = e => {
      category = e.target.value;
      render();
    };
  }
  if ($('#calendar')) $('#calendar').onclick = calendar;
  if ($('#calc-form')) {
    $('#calc-form').onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const res = calculateTargets(Object.fromEntries(fd.entries()));
      if (!res) return;
      Object.entries(res).forEach(([k, val]) => {
        const input = $(`#goal-${k}`);
        if (input) input.value = val;
      });
      toast('تم حساب الأهداف المقترحة! اضغط «حفظ الإعدادات» بالأسفل لاعتمادها.');
    };
  }
  if ($('#settings-form')) {
    $('#settings-form').onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      for (const k of Object.keys(defaults)) {
        state.profile[k] = typeof defaults[k] === 'number' ? Number(fd.get(k)) : fd.get(k).trim();
      }
      if (save()) toast('إعداداتك اتحفظت ✓');
    };
  }
  if ($('#supp-form')) {
    $('#supp-form').onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const name = fd.get('name').trim();
      const note = fd.get('note').trim();
      if (!name || !note) return;
      state.supplements.push({ id: crypto.randomUUID(), name, note });
      save();
      render();
    };
  }
  document.querySelectorAll('[data-remove-supp]').forEach(
    b =>
      (b.onclick = () => {
        state.supplements = state.supplements.filter(s => s.id !== b.dataset.removeSupp);
        save();
        render();
      })
  );
  if ($('#export')) {
    $('#export').onclick = () =>
      download(JSON.stringify(state, null, 2), 'akly-backup-' + dateKey() + '.json', 'application/json');
  }
  if ($('#import')) $('#import').onclick = () => $('#import-file').click();
  if ($('#import-file')) {
    $('#import-file').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        if (file.size > 5e6) throw Error();
        const parsed = JSON.parse(await file.text());
        if (!validBackup(parsed)) throw Error();
        if (!confirm('استبدال البيانات الحالية بالنسخة الاحتياطية؟')) return;
        state = hydrateState(parsed);
        if (save()) toast('تم استرجاع البيانات ✓');
        render();
      } catch {
        toast('الملف مش نسخة صالحة من أكلي');
      }
    };
  }
  if ($('#reset')) {
    $('#reset').onclick = () => {
      if (confirm('مسح كل الوجبات والإعدادات والمكملات من الجهاز؟ صدّر نسخة أولًا لو محتاجها.')) {
        state = defaultState();
        save();
        render();
      }
    };
  }
}

document.querySelectorAll('nav button').forEach(b => (b.onclick = () => go(b.dataset.tab)));
render();
if (storageError) toast('تعذر قراءة البيانات المحفوظة. استرجع نسخة صالحة من الإعدادات.');
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('./sw.js')
    .catch(() => toast('تعذر تفعيل وضع عدم الاتصال؛ التطبيق متاح أثناء الاتصال.'));
}
