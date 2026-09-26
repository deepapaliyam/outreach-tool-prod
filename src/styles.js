export const CSS = `
:root{
  --bg:#F5F4EF; --paper:#FFFFFF; --line:#E3E0D6; --ink:#1C2321; --ink-soft:#5B6360;
  --teal:#2F6F62; --teal-deep:#1F4A41; --rust:#C4622D; --verified:#2F6F62; --unverified:#B0361F;
  --mono: ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", Menlo, Consolas, monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
}
.app{ font-family: var(--sans); color: var(--ink); background: var(--bg); padding: 24px; border-radius: 12px; }
.topbar{ display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:14px; margin-bottom:20px; }
.eyebrow{ font-family: var(--mono); font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--teal-deep); font-weight:700; }
.topbar h1{ font-size:24px; margin:4px 0 0; letter-spacing:-0.01em; }
.tabs{ display:flex; gap:6px; flex-wrap:wrap; }
.tabs button{ display:flex; align-items:center; gap:6px; font-family:var(--sans); font-size:12.5px; font-weight:600;
  background:#fff; border:1px solid var(--line); padding:8px 12px; border-radius:7px; cursor:pointer; color:var(--ink-soft); }
.tabs button.active{ background:var(--teal); border-color:var(--teal); color:#fff; }
.grid-main{ display:grid; grid-template-columns: 340px 1fr; gap:18px; align-items:start; }
.grid-main-single{ display:grid; grid-template-columns: 1fr 1fr; gap:18px; }
@media (max-width: 860px){ .grid-main{ grid-template-columns: 1fr; } .grid-main-single{ grid-template-columns: 1fr; } }
.card{ background:var(--paper); border:1px solid var(--line); border-radius:10px; padding:20px 22px; }
.card h2{ font-size:13px; text-transform:uppercase; letter-spacing:.08em; font-weight:700; color:var(--teal-deep); margin:0 0 10px; }
.hint{ color:var(--ink-soft); font-size:12.5px; margin:0 0 12px; }
.opt{ font-weight:400; color:var(--ink-soft); text-transform:none; letter-spacing:0; }
.field-row{ margin-bottom:12px; }
.field-row.full{ grid-column: 1 / -1; }
label{ display:block; font-size:12px; font-weight:700; margin-bottom:5px; }
input[type=text], input[type=number], input[type=file], select, textarea{
  width:100%; font-family:var(--sans); font-size:13.5px; padding:8px 10px; border:1px solid var(--line);
  border-radius:6px; background:#FCFBF8; color:var(--ink);
}
textarea{ min-height:54px; resize:vertical; }
input:focus, select:focus, textarea:focus{ outline:2px solid var(--teal); outline-offset:1px; background:#fff; }
.status-line{ font-family:var(--mono); font-size:12px; color:var(--teal-deep); margin-top:8px; }
.row-between{ display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap; }
.row-inline{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:13px; }
.filters{ display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; align-items:center; }
.search-box{ display:flex; align-items:center; gap:6px; border:1px solid var(--line); border-radius:6px; padding:6px 10px; background:#FCFBF8; flex:1; min-width:160px; }
.search-box input{ border:none; background:transparent; padding:0; }
.filters select{ width:auto; }
.minscore{ display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; margin:0; }
.table-wrap{ overflow-x:auto; }
table{ width:100%; border-collapse:collapse; font-size:13px; }
th{ text-align:left; font-family:var(--mono); font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-soft); padding:8px 8px; border-bottom:1px solid var(--line); }
td{ padding:9px 8px; border-bottom:1px solid #EFEDE5; vertical-align:middle; }
.biz-name{ font-weight:700; }
.dim{ color:var(--ink-soft); font-size:12.5px; }
.mono{ font-family:var(--mono); }
.small{ font-size:12px; }
.pill{ font-family:var(--mono); font-weight:700; font-size:12px; padding:3px 8px; border-radius:20px; display:inline-block; }
.pill-hi{ background:#E4F0EC; color:var(--verified); }
.pill-mid{ background:#FBEEDF; color:var(--rust); }
.pill-lo{ background:#F1F0EC; color:var(--ink-soft); }
.btn-primary{ display:inline-flex; align-items:center; gap:6px; background:var(--rust); color:#fff; border:none; padding:9px 16px; border-radius:7px; font-weight:700; font-size:13px; cursor:pointer; }
.btn-primary:disabled{ background:#C9BEB2; cursor:default; }
.btn-ghost{ display:inline-flex; align-items:center; gap:5px; background:transparent; border:1px solid var(--line); padding:6px 11px; border-radius:6px; font-size:12px; font-weight:700; color:var(--teal-deep); cursor:pointer; }
.btn-tiny{ font-family:var(--mono); font-size:11px; font-weight:700; background:#fff; border:1px solid var(--line); padding:4px 9px; border-radius:5px; cursor:pointer; color:var(--teal-deep); white-space:nowrap; }
.btn-tiny:disabled{ opacity:.5; }
.mini-list{ display:flex; flex-direction:column; gap:4px; max-height:420px; overflow-y:auto; }
.mini-row{ display:flex; align-items:center; gap:10px; padding:7px 8px; border-radius:6px; cursor:pointer; font-size:13px; }
.mini-row:hover{ background:#F1F0EA; }
.mini-row.sel{ background:#E4F0EC; }
.mini-name{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.check-row{ display:flex; align-items:center; gap:8px; margin-bottom:12px; }
.check-row input{ width:auto; }
.check-row label{ margin:0; font-weight:500; font-size:13px; }
.grid2{ display:grid; grid-template-columns:1fr 1fr; gap:4px 18px; }
.evals{ margin:0 0 14px; padding-left:18px; }
.evals li{ font-size:13.5px; margin-bottom:6px; }
.out-box{ border:1px solid var(--line); border-radius:8px; background:#FCFBF8; padding:12px 14px; margin-top:8px; }
.out-box .label{ font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.07em; color:var(--ink-soft); font-weight:700; display:flex; justify-content:space-between; margin-bottom:6px; }
.subject-text{ font-weight:700; font-size:15px; }
.body-text{ font-size:13.5px; white-space:pre-wrap; }
.copy-btn{ font-family:var(--mono); font-size:10.5px; font-weight:700; background:transparent; border:1px solid var(--line); padding:2px 8px; border-radius:5px; cursor:pointer; color:var(--teal-deep); }
.tag{ font-family:var(--mono); font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 7px; border-radius:4px; }
.tag.verified{ background:#E4F0EC; color:var(--verified); }
.empty{ text-align:center; padding:40px 20px; color:var(--ink-soft); }
.empty-title{ font-weight:700; color:var(--ink); margin-bottom:6px; }
.empty-sub{ font-size:13px; max-width:420px; margin:0 auto; }
.spin{ animation: spin 1s linear infinite; }
@keyframes spin{ from{ transform:rotate(0deg);} to{ transform:rotate(360deg);} }
.price-stats{ display:flex; gap:30px; }
.summary-stats{ display:flex; gap:36px; flex-wrap:wrap; }
.big-num{ font-family:var(--mono); font-size:26px; font-weight:700; color:var(--teal-deep); }
.sources-box{ background:#F1F6F4; border:1px solid #D6E6E1; border-radius:7px; padding:10px 14px; margin-bottom:12px; }
.sources-label{ font-family:var(--mono); font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; color:var(--teal-deep); font-weight:700; margin-bottom:6px; }
.sources-list{ margin:0; padding-left:16px; }
.sources-list li{ font-size:12px; color:var(--ink-soft); margin-bottom:3px; }
.status-badge{ font-family:var(--mono); font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:2px 8px; border-radius:4px; margin-left:auto; white-space:nowrap; }
.status-none{ background:#F1F0EC; color:var(--ink-soft); }
.status-drafted{ background:#EAF1FA; color:#2A5C8A; }
.status-contacted{ background:#FBEEDF; color:var(--rust); }
.status-replied{ background:#E4F0EC; color:var(--teal); }
.status-proposal{ background:#F3E8D6; color:#8A6A2A; }
.status-won{ background:#DDF0E4; color:#1F7A45; }
.status-lost{ background:#F7E3DC; color:var(--unverified); }
.status-paid{ background:#CFE8D8; color:#155C33; font-weight:800; }
.body-editable{
  width:100%; min-height:140px; font-family:var(--sans); font-size:13.5px; line-height:1.5;
  border:1px solid var(--line); border-radius:6px; padding:10px 12px; resize:vertical;
  background:#fff; color:var(--ink);
}
.body-editable:disabled{ background:#F5F4EF; color:var(--ink-soft); resize:none; }
.body-editable:focus{ outline:2px solid var(--teal); outline-offset:1px; }
.refine-bar{ display:flex; gap:8px; margin-top:8px; align-items:center; }
.refine-bar input{
  flex:1; font-family:var(--sans); font-size:12.5px; padding:7px 10px;
  border:1px solid var(--line); border-radius:6px; background:#FCFBF8;
}
.refine-bar input:disabled{ background:#F5F4EF; color:var(--ink-soft); }
.pager{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:10px; padding-top:10px; border-top:1px solid var(--line); }
tr.clickable-row{ cursor:pointer; }
tr.clickable-row:hover{ background:#F1F0EA; }
tr.row-sel{ background:#E4F0EC; }
.import-row{ display:flex; align-items:center; gap:10px; margin-bottom:6px; flex-wrap:wrap; }
.import-label{ cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
.infopanel{ background:#F1F6F4; border-color:#D6E6E1; }
.how-grid{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:18px; }
@media (max-width:720px){ .how-grid{ grid-template-columns:1fr; } }
.how-h{ font-size:12px; font-weight:700; color:var(--teal-deep); margin-bottom:6px; }
.how-list{ margin:0; padding-left:16px; }
.how-list li{ font-size:12px; color:var(--ink-soft); margin-bottom:4px; }
.how-list b{ color:var(--rust); font-family:var(--mono); }
.btn-tiny.ghost{ color:var(--ink-soft); }
.expand-row td{ background:#FAF8F3; padding:0; }
.breakdown{ padding:12px 14px; }
.breakdown-total{ font-family:var(--mono); font-size:12.5px; font-weight:700; color:var(--teal-deep); margin-bottom:10px; }
.breakdown-group{ margin-bottom:8px; }
.breakdown-glabel{ font-family:var(--mono); font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-soft); font-weight:700; }
.breakdown-line{ display:flex; gap:10px; align-items:baseline; margin:3px 0 3px 4px; }
.breakdown-pts{ font-family:var(--mono); font-size:12px; font-weight:700; color:var(--teal); min-width:32px; }
.breakdown-pts.neg{ color:var(--unverified); }
.breakdown-why{ font-size:12.5px; color:var(--ink); }
`;
