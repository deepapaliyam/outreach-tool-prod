// Design system, taken from the Figma prototype: warm paper background, dark
// navy sidebar, white cards with a hairline border, indigo as the one accent.
export const CSS = `
:root{
  --bg:#F6F5F1; --surface:#FFFFFF; --line:#E6E4DC; --line-soft:#EFEDE6; --hover:#F7F6F2;
  --ink:#1A1D26; --ink-2:#555B6A; --ink-3:#8A8F9B;
  --brand:#5047D8; --brand-600:#4338CA; --brand-50:#EFEEFC; --brand-100:#E1DFFA;
  --side:#1A1E29; --side-2:#262B3B; --side-ink:#AEB3C2; --side-line:#2C3142;
  --ok:#1F7A55; --ok-bg:#E5F2EB; --ok-line:#CBE5D8;
  --warn:#9A6200; --warn-bg:#FAF3DC; --warn-line:#EBDDAE;
  --bad:#B3372A; --bad-bg:#FBEBE7; --bad-line:#F0CDC5;
  --sans:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --radius:12px;
}
*{ box-sizing:border-box; }
body{ margin:0; background:var(--bg); }
.app{ font-family:var(--sans); color:var(--ink); background:var(--bg); min-height:100vh; display:grid; grid-template-columns:236px minmax(0,1fr); font-size:14px; line-height:1.45; -webkit-font-smoothing:antialiased; }
.app button{ font-family:inherit; }
.app a{ color:var(--brand); }

/* ---------- sidebar ---------- */
.side{ background:var(--side); color:var(--side-ink); position:sticky; top:0; height:100vh; display:flex; flex-direction:column; padding:18px 12px 14px; overflow-y:auto; }
.brand{ display:flex; align-items:center; gap:10px; padding:2px 6px 18px; }
.brand-mark{ width:32px; height:32px; border-radius:9px; background:var(--brand); color:#fff; display:grid; place-items:center; flex:none; }
.brand-name{ color:#fff; font-weight:600; font-size:15px; letter-spacing:-0.01em; line-height:1.2; }
.brand-sub{ font-family:var(--mono); font-size:9.5px; letter-spacing:.08em; text-transform:uppercase; color:#7F8598; }
.side-label{ font-family:var(--mono); font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:#6F7589; padding:14px 10px 6px; }
.nav{ display:flex; flex-direction:column; gap:2px; }
.nav button{ display:flex; align-items:center; gap:11px; width:100%; text-align:left; border:0; background:transparent; color:var(--side-ink); font-size:13.5px; font-weight:500; padding:9px 10px; border-radius:8px; cursor:pointer; }
.nav button:hover{ background:#20253A; color:#fff; }
.nav button.active{ background:var(--side-2); color:#fff; }
.nav button svg{ flex:none; opacity:.9; }
.nav .count{ margin-left:auto; font-family:var(--mono); font-size:11px; color:#8A90A5; }
.nav button.active .count{ color:#C9CCE0; }
.nav .admin-link{ color:#C9B8FF; }
.limit-card{ margin-top:auto; background:#222738; border:1px solid var(--side-line); border-radius:10px; padding:12px 12px 11px; color:var(--side-ink); font-size:12px; }
.limit-row{ display:flex; justify-content:space-between; align-items:baseline; color:#E7E9F2; font-size:12px; }
.limit-row b{ font-family:var(--mono); font-weight:600; }
.bar{ height:5px; background:#34394D; border-radius:99px; overflow:hidden; margin:9px 0 7px; }
.bar > i{ display:block; height:100%; background:#8A82F2; border-radius:99px; }
.bar.full > i{ background:#E58A7B; }
.limit-note{ font-size:11px; color:#8A90A5; }
.me{ display:flex; align-items:center; gap:10px; padding:12px 6px 0; margin-top:12px; border-top:1px solid var(--side-line); }
.avatar{ width:32px; height:32px; border-radius:50%; background:#3A3F59; color:#fff; display:grid; place-items:center; font-size:12px; font-weight:600; flex:none; }
.me-text{ min-width:0; flex:1; }
.me-name{ color:#fff; font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.me-sub{ font-size:11px; color:#7F8598; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.me button{ border:0; background:transparent; color:#8A90A5; cursor:pointer; padding:6px; border-radius:6px; }
.me button:hover{ color:#fff; background:#2A2F44; }

/* ---------- main ---------- */
.main{ min-width:0; display:flex; flex-direction:column; }
.topbar{ height:50px; background:#FBFAF7; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:12px; padding:0 32px; font-size:13px; color:var(--ink-3); position:sticky; top:0; z-index:5; }
.crumb b{ color:var(--ink); font-weight:600; }
.crumb span{ margin:0 8px; color:#C2C0B6; }
.topbar .grow{ flex:1; }
.menu-btn{ display:none; border:1px solid var(--line); background:#fff; border-radius:8px; padding:6px 8px; cursor:pointer; }
.page{ width:100%; max-width:1320px; margin:0 auto; padding:28px 32px 64px; }
.page-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom:20px; }
.page-title{ font-size:30px; font-weight:600; letter-spacing:-0.025em; margin:0; line-height:1.15; }
.page-sub{ color:var(--ink-2); margin:6px 0 0; font-size:14px; max-width:640px; }
.page-actions{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

/* ---------- cards ---------- */
.card{ background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:20px; min-width:0; }
.card.flush{ padding:0; overflow:hidden; }
.card-h{ display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:4px; }
.card-title{ font-size:15px; font-weight:600; margin:0; letter-spacing:-0.005em; }
.card-sub{ color:var(--ink-2); font-size:13px; margin:2px 0 14px; }
.card-pad{ padding:18px 20px; }
.card-split{ border-top:1px solid var(--line-soft); }
.grid{ display:grid; gap:16px; }
.g-2{ grid-template-columns:repeat(2,minmax(0,1fr)); }
.g-3{ grid-template-columns:repeat(3,minmax(0,1fr)); }
.g-4{ grid-template-columns:repeat(4,minmax(0,1fr)); }
.g-5{ grid-template-columns:repeat(5,minmax(0,1fr)); }
.g-main-side{ grid-template-columns:minmax(0,1fr) 340px; align-items:start; }
.g-top{ grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); align-items:start; }
.g-top3{ grid-template-columns:repeat(3,minmax(0,1fr)); align-items:stretch; }
.g-wide-side{ grid-template-columns:minmax(0,1fr) 400px; align-items:start; }
.sticky-panel{ position:sticky; top:66px; max-height:calc(100vh - 84px); overflow-y:auto; border-radius:var(--radius); }
.biz-cell{ min-width:230px; }
td .sub{ white-space:normal; }
.g-draft{ grid-template-columns:260px minmax(0,1fr) 320px; align-items:start; }
.stack{ display:flex; flex-direction:column; gap:16px; }
.row{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.row.between{ justify-content:space-between; }
.grow{ flex:1; }
.mt8{ margin-top:8px; } .mt12{ margin-top:12px; } .mt16{ margin-top:16px; } .mt24{ margin-top:24px; }

/* ---------- text ---------- */
.eyebrow{ font-family:var(--mono); font-size:10.5px; letter-spacing:.09em; text-transform:uppercase; color:var(--ink-3); font-weight:500; }
.dim{ color:var(--ink-2); }
.faint{ color:var(--ink-3); }
.small{ font-size:12.5px; }
.xs{ font-size:11.5px; }
.mono{ font-family:var(--mono); }
.hint{ color:var(--ink-2); font-size:12.5px; margin:6px 0 0; }
.strong{ font-weight:600; }
.num{ font-variant-numeric:tabular-nums; }
.trunc{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* ---------- buttons ---------- */
.btn{ display:inline-flex; align-items:center; justify-content:center; gap:7px; border:1px solid var(--line); background:#fff; color:var(--ink); font-size:13px; font-weight:500; padding:8px 13px; border-radius:9px; cursor:pointer; white-space:nowrap; line-height:1.2; }
.btn:hover:not(:disabled){ background:var(--hover); border-color:#D8D5CA; }
.btn:disabled{ opacity:.5; cursor:default; }
.btn.primary{ background:var(--brand); border-color:var(--brand); color:#fff; font-weight:600; }
.btn.primary:hover:not(:disabled){ background:var(--brand-600); border-color:var(--brand-600); }
.btn.sm{ padding:5px 10px; font-size:12px; border-radius:7px; }
.btn.danger{ color:var(--bad); }
.btn.link{ border-color:transparent; background:transparent; color:var(--brand); font-weight:600; padding:5px 6px; }
.btn.link:hover:not(:disabled){ background:var(--brand-50); border-color:transparent; }
.btn.quiet{ border-color:transparent; background:transparent; color:var(--ink-2); }
.btn.quiet:hover:not(:disabled){ background:var(--hover); }
.icon-btn{ border:0; background:transparent; padding:5px; border-radius:6px; cursor:pointer; color:var(--ink-3); display:inline-grid; place-items:center; }
.icon-btn:hover{ background:var(--hover); color:var(--ink); }
.spin{ animation:spin 1s linear infinite; }
@keyframes spin{ to{ transform:rotate(360deg); } }

/* ---------- forms ---------- */
.field{ margin-bottom:14px; min-width:0; }
.field > label, .lbl{ display:block; font-size:12.5px; font-weight:600; margin:0 0 6px; color:var(--ink); }
.opt{ font-weight:400; color:var(--ink-3); }
input[type=text],input[type=email],input[type=tel],input[type=url],input[type=number],input[type=date],input[type=search],select,textarea{
  width:100%; font-family:var(--sans); font-size:13.5px; padding:8px 11px; border:1px solid var(--line); border-radius:9px; background:#fff; color:var(--ink); min-height:36px; }
textarea{ min-height:76px; resize:vertical; line-height:1.5; }
input::placeholder,textarea::placeholder{ color:#A5A9B4; }
input:focus,select:focus,textarea:focus{ outline:2px solid var(--brand); outline-offset:-1px; border-color:var(--brand); }
input:disabled,select:disabled,textarea:disabled{ background:#F4F3EE; color:var(--ink-3); }
.input-sm{ width:64px !important; min-height:30px !important; padding:4px 8px !important; }
.g-fields{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 16px; }
.g-fields .full{ grid-column:1 / -1; }
.search{ position:relative; flex:1 1 220px; min-width:180px; }
.search svg{ position:absolute; left:11px; top:50%; transform:translateY(-50%); color:var(--ink-3); pointer-events:none; }
.search input{ padding-left:34px; }
.check{ display:flex; align-items:center; gap:9px; font-size:13px; cursor:pointer; }
.check input{ width:16px; height:16px; accent-color:var(--brand); margin:0; }
.switch{ position:relative; width:38px; height:22px; flex:none; display:inline-block; }
.switch input{ position:absolute; inset:0; width:100%; height:100%; opacity:0; margin:0; cursor:pointer; z-index:1; }
.switch i{ position:absolute; inset:0; background:#CFCDC4; border-radius:99px; transition:.15s; }
.switch i::after{ content:''; position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#fff; transition:.15s; box-shadow:0 1px 2px rgba(0,0,0,.2); }
.switch input:checked + i{ background:var(--brand); }
.switch input:checked + i::after{ transform:translateX(16px); }
.switch input:focus-visible + i{ outline:2px solid var(--brand); outline-offset:2px; }
.seg{ display:inline-flex; padding:3px; background:#F0EEE7; border-radius:10px; gap:2px; }
.seg button{ border:0; background:transparent; padding:6px 13px; border-radius:8px; font-size:13px; font-weight:500; color:var(--ink-2); cursor:pointer; }
.seg button.on{ background:#fff; color:var(--ink); box-shadow:0 1px 2px rgba(20,20,40,.12); font-weight:600; }
.seg button.on.warn{ color:var(--bad); }
.chips{ display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.chip{ display:inline-flex; align-items:center; gap:5px; background:var(--brand-50); color:var(--brand-600); font-size:12px; font-weight:600; padding:4px 6px 4px 10px; border-radius:99px; }
.chip button{ border:0; background:transparent; color:inherit; cursor:pointer; padding:0 3px; font-size:14px; line-height:1; }
.chip-add{ border:1px dashed #CFCDC4; background:transparent; width:100px; min-height:28px !important; padding:3px 10px !important; font-size:12px !important; border-radius:99px !important; }
.filter-chips{ display:flex; gap:6px; flex-wrap:wrap; }
.filter-chips button{ border:1px solid var(--line); background:#fff; font-size:12.5px; font-weight:500; color:var(--ink-2); padding:5px 11px; border-radius:99px; cursor:pointer; }
.filter-chips button.on{ background:var(--ink); border-color:var(--ink); color:#fff; }
.filter-chips button small{ font-family:var(--mono); opacity:.7; margin-left:5px; font-size:11px; }

/* ---------- table ---------- */
.table-wrap{ overflow-x:auto; }
table{ width:100%; border-collapse:collapse; font-size:13px; }
th{ text-align:left; font-family:var(--mono); font-weight:500; font-size:10.5px; letter-spacing:.07em; text-transform:uppercase; color:var(--ink-3); padding:10px 14px; background:#FAF9F5; border-bottom:1px solid var(--line); white-space:nowrap; }
td{ padding:11px 14px; border-bottom:1px solid var(--line-soft); vertical-align:middle; }
tr:last-child td{ border-bottom:0; }
tr.click{ cursor:pointer; }
tr.click:hover td{ background:var(--hover); }
tr.sel td{ background:var(--brand-50); }
tr.sel .status{ box-shadow:inset 0 0 0 1px var(--brand-100); background:#fff; }
tr.sel:hover td{ background:var(--brand-50); }
td .sub{ font-size:12px; color:var(--ink-3); margin-top:1px; }
.biz{ font-weight:600; }
.score{ display:inline-grid; place-items:center; min-width:38px; height:30px; padding:0 8px; border-radius:7px; font-family:var(--mono); font-weight:600; font-size:13px; }
.score.hi{ background:var(--ok-bg); color:var(--ok); }
.score.mid{ background:var(--warn-bg); color:var(--warn); }
.score.lo{ background:#EFEEE9; color:var(--ink-2); }
tr.sel .score, .score.on{ background:var(--brand); color:#fff; }
.web-s{ font-size:12.5px; font-weight:500; }
.web-s.none{ color:var(--warn); } .web-s.live{ color:var(--ok); } .web-s.weak{ color:#B05E1B; } .web-s.unk{ color:var(--ink-3); }
.pager{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 18px; border-top:1px solid var(--line-soft); font-size:12.5px; color:var(--ink-2); }
.status{ display:inline-block; font-size:12px; font-weight:600; padding:3px 9px; border-radius:99px; white-space:nowrap; }
.status.none{ background:#EFEEE9; color:var(--ink-2); }
.status.drafted{ background:var(--brand-50); color:var(--brand-600); }
.status.contacted{ background:var(--warn-bg); color:var(--warn); }
.status.replied{ background:#E2F1F3; color:#1B6C78; }
.status.proposal{ background:#F1E9FA; color:#6B3FA6; }
.status.won{ background:var(--ok-bg); color:var(--ok); }
.status.paid{ background:#CDE8DA; color:#14573B; }
.status.lost{ background:var(--bad-bg); color:var(--bad); }
.tag{ display:inline-block; font-size:11.5px; font-weight:600; padding:2px 8px; border-radius:99px; }
.tag.ok{ background:var(--ok-bg); color:var(--ok); }
.tag.warn{ background:var(--warn-bg); color:var(--warn); }
.tag.bad{ background:var(--bad-bg); color:var(--bad); }
.tag.brand{ background:var(--brand-50); color:var(--brand-600); }
.tag.grey{ background:#EFEEE9; color:var(--ink-2); }
.empty{ text-align:center; padding:44px 20px; color:var(--ink-2); }
.empty-title{ font-weight:600; color:var(--ink); margin-bottom:4px; }
.empty-sub{ font-size:13px; max-width:440px; margin:0 auto; }

/* ---------- notices ---------- */
.note{ display:flex; gap:10px; align-items:flex-start; padding:10px 13px; border-radius:10px; font-size:13px; border:1px solid var(--line); background:#FBFAF7; }
.note svg{ flex:none; margin-top:2px; }
.note.ok{ background:var(--ok-bg); border-color:var(--ok-line); color:#175C40; }
.note.warn{ background:var(--warn-bg); border-color:var(--warn-line); color:#6E4800; }
.note.bad{ background:var(--bad-bg); border-color:var(--bad-line); color:#8E2A1F; }
.note.info{ background:var(--brand-50); border-color:var(--brand-100); color:#3A33A6; }
.note .grow{ min-width:0; }
.note b{ font-weight:600; }
.toasts{ position:fixed; right:18px; bottom:18px; display:flex; flex-direction:column; gap:10px; z-index:50; width:min(380px, calc(100vw - 36px)); }
.toast{ background:#fff; border:1px solid var(--line); border-left:4px solid var(--brand); border-radius:10px; padding:11px 12px 11px 14px; box-shadow:0 8px 24px rgba(20,22,40,.14); font-size:13px; display:flex; gap:10px; align-items:flex-start; }
.toast.ok{ border-left-color:var(--ok); } .toast.bad{ border-left-color:var(--bad); } .toast.warn{ border-left-color:#D19A1C; }
.toast .t-title{ font-weight:600; }
.toast .t-body{ color:var(--ink-2); margin-top:2px; word-break:break-word; }

/* ---------- stat cards ---------- */
.stat{ padding:16px 18px; }
.stat-n{ font-size:30px; font-weight:600; letter-spacing:-0.02em; line-height:1.1; margin:6px 0 4px; font-variant-numeric:tabular-nums; }
.stat-n.accent{ color:var(--brand); }
.stat-sub{ font-size:12.5px; color:var(--ink-2); }

/* ---------- upload page ---------- */
.statbar{ display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); padding:0; overflow:hidden; }
.statcell{ display:flex; flex-direction:column; align-items:flex-start; gap:0; text-align:left; padding:13px 18px 12px; background:transparent; border:0; border-left:1px solid var(--line-soft); font:inherit; color:inherit; cursor:pointer; min-width:0; }
.statcell:first-child{ border-left:0; }
.statcell:hover{ background:var(--hover); }
.statcell.on{ background:var(--brand-50); box-shadow:inset 0 -3px 0 var(--brand); }
.statcell .stat-n{ font-size:26px; margin:3px 0 2px; }
.card.compact{ padding:16px 18px; }
.card.compact .card-sub{ margin:2px 0 10px; }
.why-compact{ padding:16px 18px; max-height:360px; overflow-y:auto; scroll-margin-top:72px; }
.why-compact .why-score{ padding:10px 14px; margin:10px 0 4px; }
.why-compact .why-score .big{ font-size:30px; }
tr.day-row th{ background:var(--bg, #F4F3EE); color:var(--ink-2); text-transform:none; letter-spacing:0; font-family:inherit; font-size:12.5px; font-weight:600; padding:8px 14px; border-top:1px solid var(--line); }
tr.day-row .faint{ font-weight:400; }
.drop{ display:flex; align-items:center; gap:14px; border:1.5px dashed #CFCDC4; border-radius:11px; padding:16px 18px; background:#FCFBF8; flex-wrap:wrap; }
.drop .grow{ flex:1 1 200px; min-width:180px; }
.drop.over{ border-color:var(--brand); background:var(--brand-50); }
.drop-ico{ width:40px; height:40px; border-radius:10px; background:#fff; border:1px solid var(--line); display:grid; place-items:center; color:var(--brand); flex:none; }
.drop-t{ font-weight:600; font-size:13.5px; }
.upload-status{ display:flex; align-items:center; gap:8px; margin-top:12px; font-size:12.5px; color:var(--ink-2); }
.upload-status svg{ color:var(--ok); flex:none; }
.upload-status .r{ margin-left:auto; display:flex; gap:12px; }
.upload-status .a{ color:var(--ok); font-weight:600; }
.why-score{ background:var(--brand-50); border:1px solid var(--brand-100); border-radius:11px; padding:14px 16px; display:flex; gap:14px; align-items:center; margin:14px 0 6px; }
.why-score .big{ font-size:38px; font-weight:600; color:var(--brand); letter-spacing:-0.03em; line-height:1; font-variant-numeric:tabular-nums; }
.why-score .t{ font-weight:600; font-size:14px; }
.meter{ margin:14px 0 4px; }
.meter-h{ display:flex; justify-content:space-between; font-size:13px; font-weight:600; }
.meter-h span{ font-family:var(--mono); font-weight:500; color:var(--ink-3); font-size:12px; }
.meter .bar{ background:#ECEAF8; margin:6px 0 8px; }
.meter .bar > i{ background:var(--brand); }
.reason{ display:flex; gap:10px; font-size:12.5px; margin:3px 0; }
.reason b{ font-family:var(--mono); font-weight:600; min-width:30px; color:var(--ok); }
.reason b.neg{ color:var(--bad); }
.web-block{ border-top:1px solid var(--line-soft); margin-top:14px; padding-top:12px; font-size:13px; }
.web-h{ font-weight:600; }
.web-sec{ font-family:var(--mono); font-size:10px; letter-spacing:.09em; text-transform:uppercase; color:var(--ink-3); margin:12px 0 4px; }
.web-line{ margin:4px 0; line-height:1.45; }
.web-card{ border:1px solid var(--line); border-radius:9px; padding:9px 11px; margin:5px 0; background:#fff; }
.web-card.ok{ border-color:var(--ok-line); background:#F3FAF6; }
.web-card.warn{ border-color:var(--warn-line); background:#FDFAEC; }
.web-title{ font-weight:600; margin-top:3px; }
.web-url{ font-family:var(--mono); font-size:11px; color:var(--ink-3); word-break:break-all; }
.web-snip{ color:var(--ink-2); font-size:12px; margin-top:2px; }
.web-tag{ font-family:var(--mono); font-size:10.5px; font-weight:600; padding:1px 6px; border-radius:5px; background:#EFEEE9; color:var(--ink-2); }
.web-tag.ok{ background:var(--ok-bg); color:var(--ok); }
.web-q code{ font-family:var(--mono); font-size:11.5px; background:#F0EEE7; padding:1px 5px; border-radius:4px; }
.src-link{ color:var(--brand); text-decoration:underline; text-underline-offset:2px; }

/* ---------- email draft page ---------- */
.gmail-card{ display:flex; align-items:center; gap:22px; flex-wrap:wrap; }
.gmail-ico{ width:40px; height:40px; border-radius:10px; background:#F3F2EC; display:grid; place-items:center; color:var(--ink-2); flex:none; }
.gmail-meter{ flex:1 1 240px; min-width:220px; }
.gmail-meter .bar{ background:#ECEAF8; }
.gmail-meter .bar > i{ background:var(--brand); }
.gmail-meter .bar.full > i{ background:#D0604E; }
.queue-list{ display:flex; flex-direction:column; max-height:560px; overflow-y:auto; margin:0 -20px -20px; }
.q-item{ display:flex; align-items:flex-start; gap:8px; padding:11px 20px; border-top:1px solid var(--line-soft); position:relative; }
.q-item:hover{ background:var(--hover); }
.q-select{ flex:1; min-width:0; border:0; background:none; text-align:left; padding:0; cursor:pointer; font:inherit; color:inherit; }
.q-item.sel{ background:var(--brand-50); }
.q-item.sel::before{ content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--brand); }
.q-top{ display:flex; justify-content:space-between; gap:8px; align-items:baseline; }
.q-name{ font-weight:600; font-size:13px; }
.q-sub{ font-size:12px; color:var(--ink-3); margin-top:1px; }
.q-subj{ font-size:12.5px; color:var(--ink-2); margin-top:3px; }
.q-badge{ display:inline-block; margin-top:6px; }
.mail-meta{ display:grid; grid-template-columns:62px 1fr; gap:6px 10px; font-size:13px; padding:12px 0; border-bottom:1px solid var(--line-soft); }
.mail-meta dt{ font-family:var(--mono); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3); padding-top:2px; }
.mail-meta dd{ margin:0; min-width:0; word-break:break-word; }
.mail-subject{ font-size:17px; font-weight:600; letter-spacing:-0.01em; margin:12px 0 8px; }
.body-edit{ width:100%; min-height:300px; font-size:14px; line-height:1.6; padding:14px 16px; border-radius:11px; background:#FDFDFB; }
.body-edit:disabled{ background:#F6F5F0; color:var(--ink-2); resize:none; }
.refine{ display:flex; gap:8px; margin-top:10px; align-items:center; flex-wrap:wrap; }
.refine input{ flex:1 1 220px; }
.action-bar{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:16px; padding-top:14px; border-top:1px solid var(--line-soft); }
.preview{ border:1px solid var(--line); border-radius:11px; background:#fff; padding:16px 18px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.5; color:#222; overflow-wrap:anywhere; }
.preview img{ max-width:200px; height:auto; border:0; }
.preview a{ color:#1155CC; }
.preview p{ margin:0 0 10px; }
.resp-box{ border:1px solid var(--line); border-radius:10px; padding:10px 12px; font-size:12.5px; background:#FBFAF7; margin-top:12px; }
.resp-box.ok{ border-color:var(--ok-line); background:#F3FAF6; }
.resp-box.bad{ border-color:var(--bad-line); background:var(--bad-bg); }
.kv{ display:grid; grid-template-columns:96px 1fr; gap:3px 10px; margin-top:6px; }
.kv dt{ color:var(--ink-3); } .kv dd{ margin:0; font-family:var(--mono); font-size:12px; word-break:break-all; }
.sources{ margin:6px 0 0; padding-left:18px; font-size:12.5px; color:var(--ink-2); }
.sources li{ margin-bottom:3px; }
.evals{ margin:6px 0 0; padding-left:18px; font-size:13px; }
.evals li{ margin-bottom:4px; }
.sec-h{ font-family:var(--mono); font-size:10.5px; letter-spacing:.09em; text-transform:uppercase; color:var(--ink-3); margin:0 0 6px; }

/* ---------- sent & clients ---------- */
.queue-foot{ display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; padding:11px 20px; margin:0 -20px; border-top:1px solid var(--line-soft); background:#FAF9F5; border-radius:0 0 var(--radius) var(--radius); }
.sent-body{ margin:8px 0 0; padding:11px 13px; background:#FDFDFB; border:1px solid var(--line-soft); border-radius:9px; font-family:var(--sans); font-size:13px; line-height:1.55; white-space:pre-wrap; word-break:break-word; max-height:260px; overflow:auto; }
.fu-item{ margin-top:8px; font-size:12.5px; }
.fu-item summary{ cursor:pointer; color:var(--ink-2); }
.fu-item summary b{ color:var(--ink); }
.idea{ border:1px solid var(--line); border-radius:11px; padding:12px 14px; margin-top:10px; background:#fff; }
.idea.from-lead{ border-color:var(--brand-100); background:#FBFAFF; }
.idea-h{ display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
.idea-t{ font-weight:600; font-size:13.5px; }
.idea p{ margin:5px 0 0; font-size:12.5px; color:var(--ink-2); }
.idea p b{ color:var(--ink); font-weight:600; }

/* ---------- profile page ---------- */
.g-profile{ grid-template-columns:minmax(0,1fr) 340px; align-items:start; }
.sec-num{ width:22px; height:22px; border-radius:50%; background:var(--brand-50); color:var(--brand-600); font-size:12px; font-weight:600; display:inline-grid; place-items:center; margin-right:8px; }
.link-row{ display:grid; grid-template-columns:minmax(0,.8fr) minmax(0,1.6fr) auto; gap:8px; margin-bottom:8px; align-items:center; }
.sig-wrap{ border:1px solid var(--line); border-radius:11px; overflow:hidden; background:#fff; }
.sig-wrap:focus-within{ outline:2px solid var(--brand); outline-offset:-1px; }
.sig-tools{ display:flex; flex-wrap:wrap; gap:2px; padding:6px; background:#FAF9F5; border-bottom:1px solid var(--line); align-items:center; }
.sig-tools button{ border:0; background:transparent; width:30px; height:30px; border-radius:7px; display:inline-grid; place-items:center; cursor:pointer; color:var(--ink-2); }
.sig-tools button:hover:not(:disabled){ background:#ECEAE2; color:var(--ink); }
.sig-tools button.on{ background:var(--brand-50); color:var(--brand-600); }
.sig-tools button:disabled{ opacity:.4; cursor:default; }
.sig-tools button.btn{ width:auto; height:auto; display:inline-flex; place-items:initial; gap:6px; padding:6px 11px; border:1px solid var(--line); background:#fff; color:var(--ink); font-size:12.5px; font-weight:500; }
.sig-tools button.btn:hover:not(:disabled){ background:var(--hover); }
.sig-tools .sep{ width:1px; height:20px; background:var(--line); margin:0 5px; }
.sig-tools .color{ position:relative; }
.sig-tools .color input{ position:absolute; inset:0; opacity:0; width:100%; height:100%; cursor:pointer; padding:0; min-height:0; }
.sig-edit .ProseMirror{ min-height:170px; padding:14px 16px; outline:none; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.5; color:#222; }
.sig-edit .ProseMirror p{ margin:0 0 8px; }
.sig-edit .ProseMirror img{ max-width:200px; height:auto; display:block; }
.sig-edit .ProseMirror img.ProseMirror-selectednode{ outline:2px solid var(--brand); }
.sig-edit .ProseMirror a{ color:#1155CC; }
.sig-edit .ProseMirror ul,.sig-edit .ProseMirror ol{ margin:0 0 8px; padding-left:22px; }
.sig-edit .ProseMirror p.is-editor-empty:first-child::before{ content:attr(data-placeholder); color:#A5A9B4; float:left; height:0; pointer-events:none; }
.sig-foot{ display:flex; justify-content:space-between; gap:8px; padding:8px 12px; border-top:1px solid var(--line-soft); font-size:12px; color:var(--ink-3); flex-wrap:wrap; }
.link-pop{ display:flex; gap:8px; padding:8px; background:#FFFBEA; border-bottom:1px solid var(--warn-line); align-items:center; flex-wrap:wrap; }
.link-pop input{ flex:1 1 220px; }
.sticky-save{ position:sticky; bottom:0; z-index:4; margin-top:16px; }
.sticky-save .card{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; box-shadow:0 -4px 18px rgba(20,22,40,.07); padding:12px 18px; }

/* ---------- admin ---------- */
.admin-badge{ display:inline-flex; align-items:center; gap:6px; font-family:var(--mono); font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:#5A3FB8; background:#EFE9FD; padding:3px 9px; border-radius:99px; }
.subtabs{ display:flex; gap:4px; flex-wrap:wrap; border-bottom:1px solid var(--line); margin-bottom:16px; }
.subtabs button{ border:0; background:transparent; padding:9px 13px; font-size:13.5px; font-weight:500; color:var(--ink-2); border-bottom:2px solid transparent; margin-bottom:-1px; cursor:pointer; }
.subtabs button.on{ color:var(--brand-600); border-bottom-color:var(--brand); font-weight:600; }
.svc-list{ list-style:none; margin:12px 0 0; padding:0; display:flex; flex-direction:column; gap:8px; }
.svc-row{ display:flex; gap:10px; align-items:flex-start; padding:10px 12px; border-radius:10px; border:1px solid var(--line); }
.svc-row.ok{ background:#F3FAF6; border-color:var(--ok-line); } .svc-row.warn{ background:var(--warn-bg); border-color:var(--warn-line); } .svc-row.fail{ background:var(--bad-bg); border-color:var(--bad-line); }
.svc-row.ok .svc-icon{ color:var(--ok); } .svc-row.warn .svc-icon{ color:#B07A1E; } .svc-row.fail .svc-icon{ color:var(--bad); }
.svc-icon{ margin-top:2px; flex:none; }
.svc-label{ font-weight:600; font-size:13px; }
.svc-msg{ font-size:12.5px; margin-top:1px; }
.chip-s{ font-family:var(--mono); font-size:11px; font-weight:600; padding:2px 9px; border-radius:99px; }
.chip-s.ok{ background:var(--ok-bg); color:var(--ok); } .chip-s.warn{ background:var(--warn-bg); color:var(--warn); } .chip-s.fail{ background:var(--bad-bg); color:var(--bad); }
pre.json{ margin:0; padding:10px 12px; background:#F7F6F2; border-radius:8px; font-family:var(--mono); font-size:11.5px; overflow:auto; max-height:240px; white-space:pre-wrap; word-break:break-word; }
.code-list{ display:flex; flex-direction:column; gap:6px; margin-top:8px; }
.code-row{ display:flex; justify-content:space-between; gap:10px; font-size:13px; padding:6px 0; border-bottom:1px solid var(--line-soft); }
.code-row code{ font-family:var(--mono); font-size:12px; }

/* ---------- charts ---------- */
.chart-card .chart-h{ display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
.table-toggle{ font-size:12px; }
.legend{ display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--ink-2); margin-top:6px; }
.legend i{ display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px; vertical-align:-1px; }

/* ---------- auth ---------- */
.auth{ min-height:100vh; display:grid; place-items:center; background:var(--bg); font-family:var(--sans); padding:24px; }
.auth-card{ width:100%; max-width:400px; background:#fff; border:1px solid var(--line); border-radius:14px; padding:28px 28px 24px; }
.auth-brand{ display:flex; align-items:center; gap:11px; margin-bottom:20px; }
.auth-brand .brand-mark{ width:36px; height:36px; }
.auth h1{ font-size:20px; margin:0 0 4px; letter-spacing:-0.01em; }

/* ---------- responsive ---------- */
@media (max-width:1180px){
  .g-draft{ grid-template-columns:240px minmax(0,1fr); }
  .g-draft > :last-child{ grid-column:1 / -1; }
  .g-main-side,.g-wide-side{ grid-template-columns:minmax(0,1fr); }
  .sticky-panel{ position:static; max-height:none; overflow:visible; }
  .g-profile{ grid-template-columns:minmax(0,1fr); }
  .g-4,.g-5{ grid-template-columns:repeat(2,minmax(0,1fr)); }
  .g-top{ grid-template-columns:minmax(0,1fr); }
  .g-top3{ grid-template-columns:repeat(2,minmax(0,1fr)); }
  .g-top3 > :last-child{ grid-column:1 / -1; }
  .hide-when-grouped{ display:none; }
  .statbar{ grid-template-columns:repeat(3,minmax(0,1fr)); }
  .statcell:nth-child(4){ border-left:0; }
  .statcell:nth-child(n+4){ border-top:1px solid var(--line-soft); }
}
@media (max-width:900px){
  .app{ grid-template-columns:minmax(0,1fr); }
  .side{ position:fixed; left:0; top:0; z-index:30; width:260px; transform:translateX(-100%); transition:transform .18s; }
  .side.open{ transform:none; box-shadow:0 0 0 100vmax rgba(20,22,40,.45); }
  .menu-btn{ display:inline-flex; }
  .topbar{ padding:0 16px; }
  .page{ padding:20px 16px 56px; }
  .page-title{ font-size:25px; }
  .g-draft,.g-2,.g-3,.g-top3{ grid-template-columns:minmax(0,1fr); }
  .g-fields{ grid-template-columns:minmax(0,1fr); }
  .link-row{ grid-template-columns:minmax(0,1fr) auto; }
  .link-row input:first-child{ grid-column:1 / -1; }
}
@media (max-width:700px){
  .hide-narrow{ display:none; }
}
@media (max-width:560px){
  .g-4,.g-5{ grid-template-columns:minmax(0,1fr); }
  .statbar{ grid-template-columns:repeat(2,minmax(0,1fr)); }
  .statcell:nth-child(n){ border-left:1px solid var(--line-soft); border-top:1px solid var(--line-soft); }
  .statcell:nth-child(odd){ border-left:0; }
  .statcell:nth-child(-n+2){ border-top:0; }
}
@media print{ .side,.topbar,.toasts{ display:none; } .app{ display:block; } }
`;
