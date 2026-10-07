/* ==========================================================================
   OpenMobile-2 — page data
   Every number and list on the page, in one place, each block tagged with its
   source in the ICLR 2027 submission. Edit here, never inline in the HTML.
   ========================================================================== */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------- domains
     Seven business domains, in the paper's order (Appendix C). Colours are
     the page's categorical set; CSS reads them through --dom-* as well. */
  var DOMAINS = [
    { key: "lifestyle",     label: "Lifestyle",     color: "#5ec8f2" },
    { key: "productivity",  label: "Productivity",  color: "#a78bfa" },
    { key: "entertainment", label: "Entertainment", color: "#f472b6" },
    { key: "shopping",      label: "Shopping",      color: "#fbbf24" },
    { key: "travel",        label: "Travel",        color: "#34d399" },
    { key: "social",        label: "Social",        color: "#60a5fa" },
    { key: "finance",       label: "Finance",       color: "#fb7185" }
  ];

  /* ---------------------------------------------------------- apps
     Appendix C, Tables 6-7. runtime: "sim" = MobileGym++ client, "emu" =
     Android emulator app. flags: "new" = one of the 35 apps built in this
     work, "system" = system client. Which apps expose app-native tools is
     not listed per app in the paper; no per-app tool flag is recorded. */
  function sim(domain, names) {
    return names.map(function (n) {
      var flag = n.slice(-1);
      var name = (flag === "*" || flag === "+") ? n.slice(0, -1) : n;
      return { name: name, domain: domain, runtime: "sim",
               isNew: flag === "*", isSystem: flag === "+" };
    });
  }
  function emu(domain, names) {
    return names.map(function (n) {
      return { name: n, domain: domain, runtime: "emu", isNew: false, isSystem: false };
    });
  }
  /* "*" = built in this work, "+" = system client */
  var APPS = [].concat(
    sim("lifestyle", ["Baicizhan*", "Cainiao*", "Dianping*", "Keep*", "Luckin Coffee*", "Maoyan*",
      "Meituan*", "Meiyou*", "Weather+", "Answer Sheet+", "Browser+", "Calculator+", "Calculator 2+",
      "Clock+", "Compass+", "Gallery+", "Settings+", "Themes+"]),
    sim("productivity", ["BOSS Zhipin*", "Days Matter*", "TickTick*", "Fanqie ToDo*", "flomo*",
      "Google Drive*", "Mail*", "Slack*", "Daily*", "Tencent Meeting", "Calendar+", "Phone+", "Files+",
      "Notes+", "Messages+"]),
    sim("entertainment", ["Podcasts*", "Fanqie Novel*", "Tencent Video*", "NetEase Cloud Music+",
      "Ximalaya*", "Youku*", "Bilibili", "Spotify", "WeRead"]),
    sim("shopping", ["JD*", "Pinduoduo*", "Suning*", "Taobao*", "Taobao Instant Commerce*", "Vipshop*",
      "Xianyu*", "eBay"]),
    sim("travel", ["Ctrip*", "DiDi*", "Qunar*", "Maps", "Railway 12306"]),
    sim("social", ["Douban*", "Weibo*", "RedNote", "Reddit", "WeChat", "X"]),
    sim("finance", ["Alipay", "Kapi*"]),

    emu("lifestyle", ["Camera", "Chrome", "Clock", "Settings", "Simple Gallery Pro", "AndroidWorld",
      "Broccoli", "Clipper", "MiniWoB", "OpenTracks", "APKPure", "Breezy Weather", "Coursera",
      "DuckDuckGo", "F-Droid", "NerdCalci", "Snapseed", "Quark", "Xiachufang"]),
    emu("productivity", ["Files", "Contacts", "Dialer", "Simple SMS Messenger", "Simple Calendar Pro",
      "Joplin", "Markor", "Tasks", "Simple Draw Pro", "Audio Recorder", "Amaze", "Material Files",
      "MiXplorer", "MT Manager", "Etar", "Omni Notes FOSS", "Code Editor", "DeepL", "GeminiAssist",
      "Doubao", "Element", "Mattermost", "Session"]),
    emu("entertainment", ["VLC", "Retro Music", "iQIYI", "Youku", "Bilibili", "NetEase Cloud Music",
      "NewPipe", "AntennaPod", "Toutiao", "Yahoo News", "Yahoo Sports", "Wikipedia", "Librera", "2048",
      "Angry Birds Friends"]),
    emu("shopping", ["eBay"]),
    emu("travel", ["OsmAnd", "Booking.com", "Citymapper"]),
    emu("finance", ["Pro Expense"])
  );

  /* ---------------------------------------------------------- environment comparison
     Table 1. tri-state: true / false / "partial". */
  var ENV_COMPARE = {
    columns: ["Environment", "Platform", "Commercial apps", "Tasks", "Cross-app", "GUI", "App-native tools", "Full controllability"],
    rows: [
      { name: "AppWorld",      platform: "API",         apps: 9,  tasks: 750, cross: true,      gui: false, tools: false, control: true },
      { name: "AndroidLab",    platform: "Emulator",    apps: 5,  tasks: 138, cross: false,     gui: true,  tools: false, control: false },
      { name: "AndroidWorld",  platform: "Emulator",    apps: 0,  tasks: 116, cross: true,      gui: true,  tools: false, control: false },
      { name: "SPA-Bench",     platform: "Real device", apps: 58, tasks: 340, cross: true,      gui: true,  tools: false, control: false },
      { name: "MobileWorld",   platform: "Emulator",    apps: 4,  tasks: 201, cross: true,      gui: true,  tools: false, control: false },
      { name: "MobileGym",     platform: "Simulator",   apps: 12, tasks: 256, cross: "partial", gui: true,  tools: false, control: true },
      { name: "MobileGym++",   platform: "Simulator",   apps: 35, tasks: 215, cross: true,      gui: true,  tools: true,  control: true, ours: true }
    ]
  };

  /* ---------------------------------------------------------- app depth (Sec. 3.2)
     Median per newly built client, and the ratio to the 12 prior MobileGym
     business apps. The per-app scatter (Fig. 3) needs its CSV; not here yet. */
  var APP_DEPTH = {
    median: { routes: 37, actions: 166, transitions: 86, depth: 3 },
    ratioToPrior: { actions: 1.48, transitions: 1.91 }
  };

  /* ---------------------------------------------------------- MobileGym++ Bench (Sec. 3.5, Appendix E) */
  var BENCH = {
    total: 215,
    byApps: [
      { apps: 1, tasks: 109 },
      { apps: 2, tasks: 74 },
      { apps: 3, tasks: 27 },
      { apps: 4, tasks: 5 }
    ],
    /* a task touching several domains is counted in each; does not sum to 215 */
    byDomain: [
      { key: "productivity",  tasks: 97 },
      { key: "shopping",      tasks: 53 },
      { key: "lifestyle",     tasks: 46 },
      { key: "social",        tasks: 35 },
      { key: "finance",       tasks: 34 },
      { key: "travel",        tasks: 29 },
      { key: "entertainment", tasks: 26 }
    ]
  };

  /* ---------------------------------------------------------- OpenMobile-Data (Sec. 4, Appendix A/D) */
  var DATA = {
    sft: {
      emulator:  { trajectories: 7725, steps: 83631 },
      simulator: { trajectories: 3918, steps: 34951, hybridTrajectories: 1774 },
      total:     { trajectories: 11643, steps: 118582 }
    },
    rlTasks: 2475,
    crossAppShare: { all: 0.30, emulator: 0.40, simulator: 0.11 },
    gini: { all: 0.43, emulator: 0.52, simulator: 0.25 },
    meanGoalSimilarity: 0.43,
    /* apps per domain in each runtime (Appendix C, Table 5) */
    appsByDomain: [
      { key: "lifestyle",     sim: 18, emu: 19 },
      { key: "productivity",  sim: 15, emu: 23 },
      { key: "entertainment", sim: 9,  emu: 15 },
      { key: "shopping",      sim: 8,  emu: 1 },
      { key: "travel",        sim: 5,  emu: 3 },
      { key: "social",        sim: 6,  emu: 0 },
      { key: "finance",       sim: 2,  emu: 1 }
    ]
  };

  /* ---------------------------------------------------------- main results (Table 2)
     null = not reported. star = reproduced by the authors. std = seed std. */
  var BENCHMARKS = [
    { key: "aw",   label: "AndroidWorld",  metrics: [{ key: "p1", label: "Pass@1" }, { key: "p3", label: "Pass@3" }] },
    { key: "mw",   label: "MobileWorld",   metrics: [{ key: "gui", label: "GUI" }, { key: "mcp", label: "MCP" }] },
    { key: "mg",   label: "MobileGym",     metrics: [{ key: "sr", label: "SR" }, { key: "pr", label: "PR" }] },
    { key: "mgpp", label: "MobileGym++",   metrics: [{ key: "gui", label: "GUI" }, { key: "hybrid", label: "Hybrid" }] },
    { key: "spa",  label: "SPA-Bench",     metrics: [{ key: "l3", label: "L3" }] }
  ];
  /* cell: number | {v, star, std} | null */
  function c(v, star, std) { return { v: v, star: !!star, std: std == null ? null : std }; }
  var RESULTS = {
    groups: [
      { key: "closed", label: "Commercial & closed-weight models", rows: [
        { name: "GPT-5.6-Sol",            aw: [null, null],              mw: [70.1, null],              mg: [null, null],              mgpp: [null, null],              spa: c(68.1, true) },
        { name: "Gemini-3.1-pro-preview", aw: [70.7, null],              mw: [58.1, null],              mg: [null, null],              mgpp: [null, null],              spa: c(70.2, true) },
        { name: "MAI-UI-32B",             aw: [73.3, null],              mw: [36.2, 30.0],              mg: [null, null],              mgpp: [null, null],              spa: null },
        { name: "MAI-UI-235B-A22B",       aw: [76.7, null],              mw: [39.7, 37.5],              mg: [null, null],              mgpp: [null, null],              spa: null }
      ]},
      { key: "open", label: "Open-weight models", rows: [
        { name: "UI-Venus-1.5-8B",  aw: [73.7, null], mw: [null, null], mg: [15.4, 28.3],                 mgpp: [c(19.5, true), c(16.3, true)], spa: c(29.8, true) },
        { name: "GUI-Owl-1.5-8B",   aw: [69.0, null], mw: [38.2, 37.5], mg: [c(17.2, true), c(31.3, true)], mgpp: [c(13.0, true), c(12.6, true)], spa: null },
        { name: "GUI-Owl-1.5-32B",  aw: [69.4, null], mw: [43.9, 42.5], mg: [c(18.4, true), c(30.9, true)], mgpp: [c(18.6, true), c(23.3, true)], spa: null },
        { name: "MAI-UI-8B",        aw: [70.7, null], mw: [27.5, 20.0], mg: [c(16.8, true), c(28.3, true)], mgpp: [c(19.1, true), c(18.6, true)], spa: null }
      ]},
      { key: "opendata", label: "Open-data models", rows: [
        { name: "OpenMobile-1-8B", aw: [c(64.7, false, 3.2), 78.0], mw: [17.7, null], mg: [c(13.7, true), c(25.5, true)], mgpp: [c(13.5, true), c(7.0, true)], spa: null },
        { name: "OpenMobile-2-9B", family: "ours", size: "9B", stages: [
          { stage: "Base (Qwen3.5-9B)", aw: [c(54.3, true, 3.7), c(69.8, true)], mw: [c(12.8, true), c(12.5, true)], mg: [c(9.4, true), c(20.0, true)], mgpp: [c(9.3, true), c(12.1, true)], spa: c(25.5, true) },
          { stage: "GUI-only SFT",      aw: [c(72.8, false, 2.2), 81.9],         mw: [38.5, 12.5],                     mg: [34.8, 51.6],                   mgpp: [40.9, 41.9],                   spa: null },
          { stage: "Hybrid SFT",        aw: [c(73.3, false, 1.5), 83.6],         mw: [39.3, 27.5],                     mg: [35.9, 52.2],                   mgpp: [39.1, 44.7],                   spa: 48.9 },
          { stage: "+ RL",              aw: [c(74.0, false, 2.9), 83.6],         mw: [38.5, 27.5],                     mg: [38.3, 52.0],                   mgpp: [40.5, 46.5],                   spa: 48.9, final: true }
        ]},
        { name: "OpenMobile-2-27B", family: "ours", size: "27B", stages: [
          { stage: "Base (Qwen3.6-27B)", aw: [c(67.1, true, 4.1), c(81.9, true)], mw: [c(35.9, true), c(32.5, true)], mg: [c(37.1, true), c(50.1, true)], mgpp: [c(46.5, true), c(50.7, true)], spa: c(31.9, true) },
          { stage: "GUI-only SFT",       aw: [c(80.8, false, 2.1), 89.7],         mw: [50.4, 35.0],                     mg: [46.9, 63.1],                   mgpp: [54.9, 57.7],                   spa: null },
          { stage: "Hybrid SFT",         aw: [c(80.8, false, 3.5), 90.5],         mw: [48.7, 45.0],                     mg: [48.4, 64.5],                   mgpp: [55.3, 65.6],                   spa: 57.4 },
          { stage: "+ RL",               aw: [c(79.9, false, 3.0), 90.5],         mw: [50.4, 42.5],                     mg: [51.2, 66.6],                   mgpp: [57.2, 67.0],                   spa: 59.6, final: true }
        ]}
      ]}
    ],
    notes: {
      star: "Reproduced by the authors with the model's own harness.",
      std: "Standard deviation across evaluation seeds."
    }
  };

  /* ---------------------------------------------------------- tool use on MobileGym++ (Table 4, Sec. 5.3)
     callRate: mean app-native tool calls per task; tools: distinct tools
     invoked; tasks: tasks (of 215) with at least one tool call. */
  var TOOL_USE = [
    { model: "GUI-Owl-1.5-8B",  stage: null,           callRate: 0.58, tools: 15,  tasks: 20 },
    { model: "GUI-Owl-1.5-32B", stage: null,           callRate: 0.51, tools: 51,  tasks: 45 },
    { model: "Qwen3.5-9B",      stage: "Base",         callRate: 0.64, tools: 28,  tasks: 21 },
    { model: "Qwen3.5-9B",      stage: "+ Hybrid SFT", callRate: 1.41, tools: 110, tasks: 113 },
    { model: "Qwen3.6-27B",     stage: "Base",         callRate: 1.64, tools: 97,  tasks: 102 },
    { model: "Qwen3.6-27B",     stage: "+ Hybrid SFT", callRate: 2.23, tools: 115, tasks: 128 }
  ];
  /* success and mean steps, GUI-only vs with tools, on MobileGym++ Bench (Sec. 5.3 text):
     after hybrid SFT the tool gain is +5.6 (9B) and +10.3 (27B) points and
     trajectories are 4.8 and 5.8 steps shorter. Per-model step counts for the
     other rows are in Fig. 5b only; not reproduced here. */
  var TOOL_EFFECT = {
    stepsShorter: { "9B": 4.8, "27B": 5.8 },
    gainAfterHybridSFT: { "9B": 5.6, "27B": 10.3 },
    gainBase: { min: 2.8, max: 4.2 }
  };

  /* ---------------------------------------------------------- environment coverage (Sec. 5.3, Table 3)
     Fixed budget of 2K emulator trajectories; the 15 in-distribution apps are
     shared by all settings. Held-out and InD Pass@1 are reported for the end
     points only in the text; intermediate points live in Fig. 5a. */
  var COVERAGE = {
    budget: 2000,
    points: [
      { trainApps: 15, indShare: 1.000, heldOut: 60.7, ind: 73.7 },
      { trainApps: 25, indShare: 0.640, heldOut: null, ind: null },
      { trainApps: 35, indShare: 0.489, heldOut: null, ind: null },
      { trainApps: 45, indShare: 0.411, heldOut: null, ind: null },
      { trainApps: 53, indShare: 0.391, heldOut: 67.5, ind: 71.4 }
    ]
  };

  /* ---------------------------------------------------------- walkthroughs
     Step text for the three steppers. Sources: Sec. 4.1 and Appendix D (data
     pipeline); Sec. 3.2 and Appendix B (app construction); Appendix E.2 and
     F (the Taobao task). */
  var PIPELINE = {
    id: "pipeline",
    title: "How OpenMobile-Data is collected",
    steps: [
      { key: "abstract", label: "Abstract the environment",
        text: "Each app becomes a state-action graph. On the emulator, exploration maps screens and transitions and merges look-alike screenshots into one state. In MobileGym++ the graph comes straight from the backend's pages, actions and business objects. A global view lists what the app can do; a local view lists what the current screen can reach.",
        tag: "both runtimes" },
      { key: "synthesize", label: "Write the goals",
        text: "Conditioned on those views, the teacher model, Gemini-3.1-Pro-Preview, writes user goals that are realistic and executable, phrased as goals rather than widget names. Low-quality and near-duplicate goals are filtered out.",
        tag: "teacher model" },
      { key: "rollout", label: "Roll out",
        text: "The same model executes each goal in its environment, one thought and one action per turn. When the foreground app exposes tools, the catalog is attached and a turn may be a tool call instead of a tap.",
        tag: "teacher model" },
      { key: "verify", label: "Verify",
        text: "A rollout is kept only if it completes the task under the runtime's own check: a programmatic verifier over business state in MobileGym++, a vision-language judge on the emulator.",
        tag: "runtime check" },
      { key: "filter", label: "Filter the steps",
        text: "Action loops and steps that leave the app state unchanged are removed from the kept rollouts.",
        tag: "step level" },
      { key: "release", label: "Release",
        text: "Demonstration trajectories keep the full observation-action sequence for supervised fine-tuning. Executable RL tasks keep only the instruction, a snapshot of the initial state and the verifier, so every rollout starts from the same state and is scored the same way whether it used taps or tool calls.",
        tag: "released" }
    ]
  };

  /* Flow-diagram form of the same pipeline (Sec. 4.1, Appendix D): short
     labels and one-line captions, two runtimes converging into shared
     stages and splitting into the two released resources. */
  var PIPELINE_FLOW = {
    lanes: [
      { key: "emu", label: "Android emulator", caption: "Apps explored screen by screen; look-alike screens merged into one state." },
      { key: "sim", label: "MobileGym++", caption: "Pages, actions and business objects read straight from the app spec." }
    ],
    stages: [
      { key: "graph",   label: "App graph",    caption: "A state-action graph per app: a global view of what it can do, a local view of what the current screen reaches." },
      { key: "goals",   label: "Write goals",  caption: "The teacher model writes executable user goals from the views; low-quality and near-duplicate goals are dropped.", tag: "Gemini-3.1-Pro-Preview" },
      { key: "rollout", label: "Roll out",     caption: "The same model executes each goal, one thought and one action per turn, with tool calls when the app exposes tools." },
      { key: "verify",  label: "Verify",       caption: "Kept only if the task completes: a VLM judge on the emulator, the programmatic verifier in MobileGym++.", drop: true },
      { key: "filter",  label: "Filter steps", caption: "Action loops and steps that leave the app state unchanged are removed.", drop: true }
    ],
    outputs: [
      { key: "sft", label: "Demonstration trajectories", sub: "for supervised fine-tuning", caption: "Full observation and action sequences, including runs that interleave tool calls." },
      { key: "rl",  label: "Executable RL tasks",       sub: "instruction, initial state, verifier", caption: "Every rollout starts from the same snapshot and is scored the same way for taps and tool calls." }
    ]
  };

  var CONSTRUCTION = {
    id: "construction",
    title: "How a commercial app is rebuilt",
    steps: [
      { key: "specify", label: "Specify",
        text: "Core workflows are written down first as a graph of pages and UI states. Every state-changing interaction names its element and action, the state it changes and a check for the result.",
        code: '{\n  "id": "detail.skuPanel",\n  "interactions": [{\n    "element": "Add to cart",\n    "effect": "state",\n    "actionId": "sku.addToCart.confirm",\n    "stateChange": "cart.items += item",\n    "stateCheck": "item and quantity match"\n  }]\n}' },
      { key: "implement", label: "Implement",
        text: "Routes and actions are built over app-owned state and seeded data. GUI actions and app-native tools share that state, so a tool call changes what the screen renders." },
      { key: "check", label: "Check",
        text: "A coverage check maps each declared interaction to its implementation, and a replay of the core flows confirms that each transition produces the declared state change." },
      { key: "compare", label: "Compare with the live app",
        text: "Annotators walk the replica against the real application and refine functionality and visual detail until the transitions and interface details match." },
      { key: "tasks", label: "Author tasks",
        text: "Benchmark instructions and terminal verifiers are written on top of the finished app: a user goal, a bound initial state and a checker over the before-and-after diff of business state." }
    ]
  };

  /* Task 111 (HTV6Case69) from Appendix E.2. The hybrid lane follows the
     tool calls the appendix names; the GUI-only lane is the same goal through
     screens, listed schematically until screenshots are available. */
  var TASK_TAOBAO = {
    id: "taobao",
    goal: "Buy a Jianmu large-capacity insulated flask in 316 stainless steel, ship it to the saved address tagged School, and pay with Huabei installments.",
    app: "Taobao",
    check: "A new paid order for the flask, with the School address and Huabei installments recorded on it.",
    state: [
      { key: "cart",    label: "Cart",    initial: "empty" },
      { key: "address", label: "Address", initial: "none" },
      { key: "payment", label: "Payment", initial: "none" },
      { key: "order",   label: "Order",   initial: "none" }
    ],
    lanes: {
      gui: { label: "GUI-only", steps: [
        { label: "Search", text: "Type the flask's name into the search bar.", kind: "gui" },
        { label: "Open the item", text: "Tap the matching listing.", kind: "gui" },
        { label: "Choose the SKU", text: "Pick 316 stainless steel in the options panel.", kind: "gui" },
        { label: "Add to cart", text: "Confirm the SKU and quantity.", kind: "gui", state: { cart: "1 item" } },
        { label: "Check out", text: "Open the cart and start checkout.", kind: "gui" },
        { label: "Pick the address", text: "Choose the address tagged School.", kind: "gui", state: { address: "School" } },
        { label: "Pick the payment", text: "Choose Huabei installments.", kind: "gui", state: { payment: "Huabei" } },
        { label: "Pay", text: "Confirm the payment.", kind: "gui", state: { order: "paid" } }
      ]},
      hybrid: { label: "Hybrid GUI + tools", steps: [
        { label: "taobao__search_items", text: "One call returns the matching listings.", kind: "tool", call: "taobao__search_items(query)" },
        { label: "taobao__get_item_summary", text: "One call returns the item and its SKUs.", kind: "tool", call: "taobao__get_item_summary(item_id)" },
        { label: "taobao__add_to_cart", text: "Validates item, SKU and quantity, then writes the shared cart.", kind: "tool", call: "taobao__add_to_cart(item_id, sku_description, quantity)", state: { cart: "1 item" } },
        { label: "taobao__prepare_checkout", text: "Opens the confirmation page as a draft. No order, no payment yet.", kind: "tool", call: "taobao__prepare_checkout(cart_line_ids)" },
        { label: "Pick the address", text: "Back in the GUI: choose the address tagged School.", kind: "gui", state: { address: "School" } },
        { label: "Pick the payment", text: "Choose Huabei installments.", kind: "gui", state: { payment: "Huabei" } },
        { label: "Pay", text: "Confirm the payment.", kind: "gui", state: { order: "paid" } }
      ]}
    }
  };

  /* Taobao tool schemas (Appendix F). */
  var TOOL_SCHEMAS = [
    { name: "taobao__search_items",      sig: "taobao__search_items(query: string, limit?: integer)", kind: "read",  note: "Reads the catalog." },
    { name: "taobao__get_item_summary",  sig: "taobao__get_item_summary(item_id: string)", kind: "read",  note: "Reads one item." },
    { name: "taobao__add_to_cart",       sig: "taobao__add_to_cart(item_id: string, sku_description: string,\n                  quantity: integer [1..99])", kind: "write", note: "Validates item, SKU and quantity, then writes the shared cart." },
    { name: "taobao__prepare_checkout",  sig: "taobao__prepare_checkout(cart_line_ids: string[1..30])", kind: "navigate", note: "Opens the confirmation page. Creates neither an order nor a payment; the GUI continues from the same state." }
  ];

  /* Cross-app mechanisms (Sec. 3.3). The paper names the four; the one-line
     descriptions are the page's. */
  var CROSS_APP = [
    { key: "clipboard", label: "Clipboard transfer", text: "Copy a value in one app and paste it into a field in another.",
      from: { app: "Weibo", color: "#e8564b", screen: "post" }, to: { app: "Notes", color: "#f2b53c", screen: "note" },
      action: "Copy", payload: { kind: "text", value: "Open day, Nov 12, 2 pm, Hall B" }, roundTrip: false },
    { key: "share", label: "App-to-app sharing", text: "Send an item from one app into another through the share sheet.",
      from: { app: "Gallery", color: "#4a8af4", screen: "gallery" }, to: { app: "WeChat", color: "#2dc100", screen: "chat" },
      action: "Share", sheet: "share", payload: { kind: "photo", value: "IMG_0412" }, roundTrip: false },
    { key: "payment", label: "Payment redirection", text: "A checkout hands off to the payment app and returns with the result.",
      from: { app: "Taobao", color: "#ff5000", screen: "checkout" }, to: { app: "Alipay", color: "#1677ff", screen: "paysheet" },
      action: "Pay", payload: { kind: "amount", value: "\u00a5128.00" }, roundTrip: true, result: "Paid" },
    { key: "media", label: "Media selection", text: "Pick a photo or file from the gallery inside another app's flow.",
      from: { app: "Xianyu", color: "#ffd21e", screen: "listing" }, to: { app: "Gallery", color: "#4a8af4", screen: "picker" },
      action: "Add photos", payload: { kind: "photos", value: 2 }, roundTrip: true, result: "2 photos added" }
  ];

  /* ---------------------------------------------------------- app glyphs
     One small icon per app for the hero wall, by name; apps not listed fall
     back to their domain's glyph. Keys are symbol ids in om2-appwall.js. */
  var DOMAIN_GLYPH = { lifestyle: "pin", productivity: "check", entertainment: "play",
    shopping: "bag", travel: "plane", social: "chat", finance: "coin" };
  var APP_GLYPH = {
    "Baicizhan": "book", "Cainiao": "box", "Dianping": "star", "Keep": "dumbbell",
    "Luckin Coffee": "coffee", "Maoyan": "film", "Meituan": "food", "Meiyou": "heart",
    "Weather": "sun", "Answer Sheet": "list", "Browser": "globe", "Calculator": "calc",
    "Calculator 2": "calc", "Clock": "clock", "Compass": "compass", "Gallery": "image",
    "Settings": "gear", "Themes": "palette",
    "BOSS Zhipin": "briefcase", "Days Matter": "calendar", "TickTick": "check",
    "Fanqie ToDo": "list", "flomo": "pen", "Google Drive": "cloud", "Mail": "mail",
    "Slack": "hash", "Daily": "news", "Tencent Meeting": "video", "Calendar": "calendar",
    "Phone": "phone", "Files": "folder", "Notes": "note", "Messages": "chat",
    "Podcasts": "mic", "Fanqie Novel": "book", "Tencent Video": "play",
    "NetEase Cloud Music": "music", "Ximalaya": "mic", "Youku": "play", "Bilibili": "tv",
    "Spotify": "music", "WeRead": "book",
    "JD": "cart", "Pinduoduo": "tag", "Suning": "cart", "Taobao": "bag",
    "Taobao Instant Commerce": "box", "Vipshop": "tag", "Xianyu": "tag", "eBay": "bag",
    "Ctrip": "plane", "DiDi": "car", "Qunar": "plane", "Maps": "map", "Railway 12306": "train",
    "Douban": "star", "Weibo": "at", "RedNote": "heart", "Reddit": "chat", "WeChat": "chat", "X": "x",
    "Alipay": "coin", "Kapi": "card",
    "Camera": "camera", "Chrome": "globe", "Simple Gallery Pro": "image", "AndroidWorld": "grid",
    "Broccoli": "food", "Clipper": "list", "MiniWoB": "grid", "OpenTracks": "route",
    "APKPure": "download", "Breezy Weather": "sun", "Coursera": "cap", "DuckDuckGo": "search",
    "F-Droid": "download", "NerdCalci": "calc", "Snapseed": "image", "Quark": "search",
    "Xiachufang": "food",
    "Contacts": "person", "Dialer": "phone", "Simple SMS Messenger": "chat",
    "Simple Calendar Pro": "calendar", "Joplin": "note", "Markor": "note", "Tasks": "check",
    "Simple Draw Pro": "pen", "Audio Recorder": "mic", "Amaze": "folder", "Material Files": "folder",
    "MiXplorer": "folder", "MT Manager": "folder", "Etar": "calendar", "Omni Notes FOSS": "note",
    "Code Editor": "code", "DeepL": "translate", "GeminiAssist": "sparkle", "Doubao": "sparkle",
    "Element": "chat", "Mattermost": "hash", "Session": "chat",
    "VLC": "play", "Retro Music": "music", "iQIYI": "tv", "NewPipe": "play", "AntennaPod": "mic",
    "Toutiao": "news", "Yahoo News": "news", "Yahoo Sports": "ball", "Wikipedia": "book",
    "Librera": "book", "2048": "grid", "Angry Birds Friends": "gamepad",
    "OsmAnd": "map", "Booking.com": "bed", "Citymapper": "bus", "Pro Expense": "receipt"
  };
  APPS.forEach(function (a) { a.icon = APP_GLYPH[a.name] || DOMAIN_GLYPH[a.domain]; });

  global.OM2 = {
    domainGlyph: DOMAIN_GLYPH,
    domains: DOMAINS,
    apps: APPS,
    envCompare: ENV_COMPARE,
    appDepth: APP_DEPTH,
    bench: BENCH,
    data: DATA,
    benchmarks: BENCHMARKS,
    results: RESULTS,
    toolUse: TOOL_USE,
    toolEffect: TOOL_EFFECT,
    coverage: COVERAGE,
    walkthroughs: { pipeline: PIPELINE, construction: CONSTRUCTION, taobao: TASK_TAOBAO },
    pipelineFlow: PIPELINE_FLOW,
    toolSchemas: TOOL_SCHEMAS,
    crossApp: CROSS_APP,
    domainByKey: DOMAINS.reduce(function (m, d) { m[d.key] = d; return m; }, {})
  };
})(window);
