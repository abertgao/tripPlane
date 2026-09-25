import { useMemo, useState } from "react";

const SEED = [
  {
    id: "kyoto",
    title: "京都三日",
    city: "京都",
    from: "上海",
    start: "2026-10-03",
    end: "2026-10-06",
    people: 2,
    status: "待出发",
    flight: "MU529",
    depart: "08:40",
    arrive: "12:05",
    note: "先寺后巷，晚上留在先斗町。",
    days: [
      { day: "10/03", title: "抵达与街区", items: ["浦东 T1 出发", "关西机场入境", "入住祇园，步行清水坂"] },
      { day: "10/04", title: "东山", items: ["清晨清水寺", "二年坂三年坂", "下午南禅寺"] },
      { day: "10/05", title: "岚山", items: ["渡月桥", "竹林", "返程前买伴手礼"] },
    ],
  },
  {
    id: "chengdu",
    title: "成都周末",
    city: "成都",
    from: "北京",
    start: "2026-11-14",
    end: "2026-11-16",
    people: 1,
    status: "草稿",
    flight: "未订",
    depart: "--:--",
    arrive: "--:--",
    note: "火锅和看熊猫，机票还没锁。",
    days: [
      { day: "11/14", title: "进城", items: ["宽窄巷子", "人民公园"] },
      { day: "11/15", title: "市区", items: ["熊猫基地", "晚上火锅"] },
    ],
  },
  {
    id: "qingdao",
    title: "青岛海岸",
    city: "青岛",
    from: "杭州",
    start: "2026-08-02",
    end: "2026-08-05",
    people: 3,
    status: "已完成",
    flight: "CA1572",
    depart: "11:20",
    arrive: "13:05",
    note: "栈桥和八大关已经走过。",
    days: [
      { day: "08/02", title: "海岸", items: ["栈桥", "信号山"] },
      { day: "08/03", title: "老城", items: ["八大关", "小麦岛"] },
    ],
  },
];

const NAV = [
  { id: "home", label: "概览" },
  { id: "trips", label: "行程" },
  { id: "new", label: "新建" },
];

function daysUntil(dateStr) {
  const today = new Date("2026-09-26T00:00:00");
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

function formatRange(start, end) {
  const a = start.slice(5).replace("-", "/");
  const b = end.slice(5).replace("-", "/");
  return `${a} – ${b}`;
}

export default function App() {
  const [trips, setTrips] = useState(SEED);
  const [view, setView] = useState("home");
  const [activeId, setActiveId] = useState("kyoto");
  const [filter, setFilter] = useState("全部");

  const active = trips.find((t) => t.id === activeId) || trips[0];
  const upcoming = useMemo(
    () => trips.filter((t) => t.status === "待出发").sort((a, b) => a.start.localeCompare(b.start))[0],
    [trips]
  );

  function openTrip(id) {
    setActiveId(id);
    setView("detail");
  }

  function addTrip(draft) {
    const id = `t-${Date.now()}`;
    const trip = {
      id,
      title: draft.title || `${draft.city}行程`,
      city: draft.city,
      from: draft.from,
      start: draft.start,
      end: draft.end,
      people: Number(draft.people) || 1,
      status: "草稿",
      flight: "未订",
      depart: "--:--",
      arrive: "--:--",
      note: draft.note || "刚建好，还没排每天的安排。",
      days: [{ day: draft.start.slice(5).replace("-", "/"), title: "第一天", items: ["待补充"] }],
    };
    setTrips((list) => [trip, ...list]);
    setActiveId(id);
    setView("detail");
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <span className="mark">TP</span>
          <div>
            <strong>tripPlane</strong>
            <small>行程与航班</small>
          </div>
        </div>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "nav on" : "nav"}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {upcoming && (
          <button className="next" onClick={() => openTrip(upcoming.id)}>
            <span>下一班</span>
            <strong>{upcoming.city}</strong>
            <em>{upcoming.flight} · {upcoming.depart}</em>
          </button>
        )}
      </aside>
      <main>
        {view === "home" && (
          <Home trips={trips} upcoming={upcoming} onOpen={openTrip} onCreate={() => setView("new")} />
        )}
        {view === "trips" && (
          <TripList trips={trips} filter={filter} setFilter={setFilter} onOpen={openTrip} />
        )}
        {view === "detail" && active && <Detail trip={active} onBack={() => setView("trips")} />}
        {view === "new" && <NewTrip onCancel={() => setView("trips")} onSave={addTrip} />}
      </main>
    </div>
  );
}

function Home({ trips, upcoming, onOpen, onCreate }) {
  const counts = {
    待出发: trips.filter((t) => t.status === "待出发").length,
    草稿: trips.filter((t) => t.status === "草稿").length,
    已完成: trips.filter((t) => t.status === "已完成").length,
  };
  const left = upcoming ? daysUntil(upcoming.start) : null;

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <p className="kicker">今天 · 9月26日</p>
          <h1>把下一趟先排清楚</h1>
        </div>
        <button className="primary" onClick={onCreate}>新建行程</button>
      </header>

      {upcoming && (
        <article className="hero" onClick={() => onOpen(upcoming.id)}>
          <div>
            <p className="kicker">即将出发</p>
            <h2>{upcoming.title}</h2>
            <p className="muted">{upcoming.from} → {upcoming.city} · {formatRange(upcoming.start, upcoming.end)} · {upcoming.people} 人</p>
          </div>
          <div className="hero-side">
            <b>{left > 0 ? `${left} 天` : left === 0 ? "今天" : "已出发"}</b>
            <span>{upcoming.flight}</span>
          </div>
        </article>
      )}

      <div className="stats">
        {Object.entries(counts).map(([name, n]) => (
          <div key={name} className="stat">
            <span>{name}</span>
            <strong>{n}</strong>
          </div>
        ))}
      </div>

      <h3 className="block-title">最近的行程</h3>
      <div className="cards">
        {trips.map((trip) => (
          <button key={trip.id} className="card" onClick={() => onOpen(trip.id)}>
            <div className="card-top">
              <Status value={trip.status} />
              <span className="flight">{trip.flight}</span>
            </div>
            <h3>{trip.city}</h3>
            <p>{formatRange(trip.start, trip.end)}</p>
            <p className="muted">{trip.from} 出发 · {trip.people} 人</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function TripList({ trips, filter, setFilter, onOpen }) {
  const filters = ["全部", "待出发", "草稿", "已完成"];
  const shown = filter === "全部" ? trips : trips.filter((t) => t.status === filter);

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <p className="kicker">全部行程</p>
          <h1>{shown.length} 条</h1>
        </div>
      </header>
      <div className="filters">
        {filters.map((name) => (
          <button key={name} className={filter === name ? "chip on" : "chip"} onClick={() => setFilter(name)}>
            {name}
          </button>
        ))}
      </div>
      <ul className="rows">
        {shown.map((trip) => (
          <li key={trip.id}>
            <button className="row" onClick={() => onOpen(trip.id)}>
              <div>
                <strong>{trip.title}</strong>
                <span>{trip.from} → {trip.city}</span>
              </div>
              <div className="row-mid">{formatRange(trip.start, trip.end)}</div>
              <Status value={trip.status} />
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="empty">这个状态下面还没有行程。</li>}
      </ul>
    </section>
  );
}

function Detail({ trip, onBack }) {
  return (
    <section className="page">
      <button className="text-btn" onClick={onBack}>返回行程</button>
      <header className="page-head">
        <div>
          <p className="kicker">{trip.from} → {trip.city}</p>
          <h1>{trip.title}</h1>
          <p className="muted">{formatRange(trip.start, trip.end)} · {trip.people} 人</p>
        </div>
        <Status value={trip.status} />
      </header>

      <article className="ticket">
        <div>
          <span>航班</span>
          <strong>{trip.flight}</strong>
        </div>
        <div>
          <span>起飞</span>
          <strong>{trip.depart}</strong>
          <em>{trip.from}</em>
        </div>
        <div className="ticket-line" />
        <div>
          <span>到达</span>
          <strong>{trip.arrive}</strong>
          <em>{trip.city}</em>
        </div>
      </article>

      <p className="note">{trip.note}</p>

      <h3 className="block-title">按天安排</h3>
      <ol className="days">
        {trip.days.map((day) => (
          <li key={day.day}>
            <div className="day-no">{day.day}</div>
            <div>
              <strong>{day.title}</strong>
              <ul>
                {day.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function NewTrip({ onCancel, onSave }) {
  const [form, setForm] = useState({
    title: "",
    from: "上海",
    city: "",
    start: "2026-12-01",
    end: "2026-12-04",
    people: 2,
    note: "",
  });
  const [error, setError] = useState("");

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit(event) {
    event.preventDefault();
    if (!form.city.trim()) {
      setError("先写目的地。");
      return;
    }
    if (form.end < form.start) {
      setError("结束日期要晚于开始日期。");
      return;
    }
    setError("");
    onSave(form);
  }

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <p className="kicker">新的一趟</p>
          <h1>新建行程</h1>
        </div>
      </header>
      <form className="form" onSubmit={submit}>
        <label>
          标题
          <input value={form.title} placeholder="例如：厦门四日" onChange={(e) => update("title", e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            出发地
            <input value={form.from} onChange={(e) => update("from", e.target.value)} />
          </label>
          <label>
            目的地
            <input value={form.city} placeholder="城市" onChange={(e) => update("city", e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            开始
            <input type="date" value={form.start} onChange={(e) => update("start", e.target.value)} />
          </label>
          <label>
            结束
            <input type="date" value={form.end} onChange={(e) => update("end", e.target.value)} />
          </label>
          <label>
            人数
            <input type="number" min="1" max="12" value={form.people} onChange={(e) => update("people", e.target.value)} />
          </label>
        </div>
        <label>
          备注
          <textarea rows="3" value={form.note} placeholder="这趟最想做的事" onChange={(e) => update("note", e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="ghost" onClick={onCancel}>取消</button>
          <button type="submit" className="primary">保存行程</button>
        </div>
      </form>
    </section>
  );
}

function Status({ value }) {
  const tone = value === "待出发" ? "go" : value === "已完成" ? "done" : "draft";
  return <span className={`status ${tone}`}>{value}</span>;
}
