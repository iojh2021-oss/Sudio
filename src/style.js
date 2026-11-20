// استایل‌ها از داخل جاوااسکریپت تزریق می‌شوند (index.html فقط یک پوستهٔ خالی است)
export const CSS = `
:root{--bg:#0a0d11;--panel:#10161dee;--line:#28323d;--ink:#e9eef3;--mut:#93a1ae;--acc:#e0453a;--acc2:#f2b84b;--ok:#47c08a;font-family:system-ui,'Vazirmatn','Noto Sans Arabic',Tahoma,sans-serif}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;height:100%;overflow:hidden;background:#000;color:var(--ink);direction:rtl;touch-action:none;user-select:none}
#stage{position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none}
.top{position:fixed;top:0;left:0;right:0;display:flex;gap:6px;align-items:center;padding:calc(env(safe-area-inset-top) + 8px) 10px 6px;background:linear-gradient(#000a,#0000);z-index:5}
.top .t{font-weight:700;letter-spacing:.5px;margin-inline-end:auto;text-shadow:0 1px 4px #000}.top .t small{color:var(--mut);font-weight:400;margin-inline-start:6px}
.btn{border:1px solid var(--line);background:#161e27;color:var(--ink);border-radius:12px;padding:9px 12px;font:inherit;font-size:14px;min-height:40px;cursor:pointer}.btn:active{transform:scale(.97)}
.btn.pri{background:var(--acc);border-color:#ff7b70;font-weight:700}.btn.go{background:#1d7a58;border-color:#3fc592}.btn.rec{background:#b3261e;animation:pulse 1s infinite}.btn.sm{padding:5px 9px;min-height:30px;font-size:12px}
@keyframes pulse{50%{opacity:.6}}
.bar{position:fixed;left:10px;right:10px;bottom:calc(env(safe-area-inset-bottom) + 0px);z-index:6}
.sheet{background:var(--panel);backdrop-filter:blur(10px);border:1px solid var(--line);border-radius:18px 18px 0 0;max-height:52vh;display:flex;flex-direction:column;transition:transform .25s}
.sheet.closed{transform:translateY(calc(100% - 46px))}.handle{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer}
.tabs{display:flex;gap:4px;overflow-x:auto;flex:1}.tab{flex:none;padding:6px 11px;border-radius:10px;background:transparent;border:0;color:var(--mut);font:inherit;font-size:13px}.tab.on{background:#1f2a35;color:var(--ink)}
.pane{overflow:auto;padding:4px 12px 14px;touch-action:pan-y;-webkit-overflow-scrolling:touch}
label{display:block;font-size:12px;color:var(--mut);margin:8px 0 3px}input[type=text],textarea,select,input[type=number]{width:100%;background:#0b1015;color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:9px;font:inherit;font-size:14px;user-select:text}
textarea{min-height:92px;resize:vertical;line-height:1.7}input[type=range]{width:100%;accent-color:var(--acc)}
.row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.row>*{flex:1 1 auto}.row3{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.cc{display:flex;flex-direction:column;align-items:center;font-size:11px;gap:2px}.cc input[type=color]{width:100%;height:30px;padding:0;border:1px solid var(--line);border-radius:8px;background:none}.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{padding:6px 11px;border-radius:999px;background:#18212b;border:1px solid var(--line);font-size:13px}.chip.on{background:var(--acc);border-color:#ff8b80}
.note{font-size:12px;color:var(--mut);line-height:1.7}.ev{display:flex;gap:6px;align-items:center;padding:6px;border:1px solid var(--line);border-radius:10px;margin:4px 0;font-size:12px}.ev b{min-width:42px}.ev span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hud{position:fixed;left:10px;top:calc(env(safe-area-inset-top) + 54px);font:11px/1.5 monospace;color:#cfe;background:#0007;padding:4px 7px;border-radius:8px;z-index:4;direction:ltr;pointer-events:none}
.joy{position:fixed;left:18px;bottom:30vh;width:116px;height:116px;border-radius:50%;background:#ffffff14;border:1px solid #ffffff30;z-index:4;touch-action:none}.joy i{position:absolute;left:36px;top:36px;width:44px;height:44px;border-radius:50%;background:#ffffff55}
.runb{position:fixed;left:150px;bottom:calc(30vh + 36px);z-index:4;width:56px;height:56px;border-radius:50%;background:#ffffff1a;border:1px solid #ffffff30;color:#fff;font-size:11px}.runb.on{background:var(--acc)}
.prog{position:fixed;left:0;right:0;top:0;height:3px;background:#0006;z-index:7}.prog i{display:block;height:100%;width:0;background:var(--acc2)}
.toast{position:fixed;left:50%;top:70px;transform:translateX(-50%);background:#000c;border:1px solid var(--line);padding:9px 14px;border-radius:12px;z-index:20;max-width:88vw;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none}.toast.on{opacity:1}
.sub{position:fixed;left:50%;bottom:calc(30vh + 4px);transform:translateX(-50%);max-width:86vw;text-align:center;font-size:17px;line-height:1.7;text-shadow:0 2px 6px #000,0 0 12px #000;z-index:3;pointer-events:none}
.splash{position:fixed;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;background:#000c;z-index:30;text-align:center;padding:24px}.splash h1{margin:0;font-size:28px}.splash p{color:var(--mut);max-width:420px;line-height:1.8;margin:0}
@media (min-width:900px){.bar{left:auto;right:16px;width:440px}.joy,.runb{display:none}}
`;
