import json, sys
from playwright.sync_api import sync_playwright
BASE='http://localhost:8123/index.html'
errs=[]; results=[]
def ok(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ')+name+(' '+str(extra) if (extra and not cond) else ''))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width':412,'height':915}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='nl-NL', timezone_id='Europe/Amsterdam')
    page = ctx.new_page()
    page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.clock.install(time='2026-11-16T08:00:00')
    page.goto(BASE)
    page.wait_for_selector('#setupDate')
    ok('setup toont startdatum', page.input_value('#setupDate')=='2026-11-16')
    page.screenshot(path='/tmp/s0_setup.png')
    page.click('[data-act=setup]')
    page.wait_for_selector('.card.s')
    st = lambda: page.evaluate('window.__app.state')
    S = st()
    ok('planning aangemaakt', len(S['sched'])>=5*11, len(S['sched']))
    ok('maandag: upper en stretch', page.locator('.card.s .title').all_inner_texts()[:2]==['Gym upper','Trap-stretch (optioneel)'], page.locator('.card.s .title').all_inner_texts())
    ok('ochtendblok zichtbaar', page.locator('#m-warm').count()==1)
    page.screenshot(path='/tmp/s1_today.png', full_page=True)

    # vinkje upper
    page.locator('.card.s', has_text='Gym upper').locator('[data-act=done]').click()
    ok('upper gedaan', [x for x in st()['sched'] if x['id']=='UPPER-2026-11-16'][0]['status']=='done')
    # undo
    page.click('.toast [data-act=undo]')
    ok('ongedaan maken werkt', [x for x in st()['sched'] if x['id']=='UPPER-2026-11-16'][0]['status']=='planned')

    # wissel upper <-> lower
    page.locator('.card.s', has_text='Gym upper').locator('[data-act=swapopen]').click()
    page.wait_for_selector('.sheet')
    page.screenshot(path='/tmp/s2_swap.png')
    page.locator('.sheet [data-act=swapprev]', has_text='Gym lower').click()
    page.wait_for_selector('.sheet h3')
    txt = page.inner_text('.sheet')
    page.screenshot(path='/tmp/s3_preview.png', full_page=True)
    ok('preview toont weekbalans', 'Deze week: upper' in txt and 'lower' in txt, txt)
    ok('preview heeft knoppen', all(k in txt for k in ['Bevestig','Annuleren']), txt)
    page.click('[data-act=previewgo][data-m=repaired]')
    S = st()
    up = [x for x in S['sched'] if x['id']=='UPPER-2026-11-16'][0]; lw=[x for x in S['sched'] if x['id']=='LOWER-2026-11-21'][0]
    ok('upper nu zaterdag, lower maandag', up['date']=='2026-11-21' and lw['date']=='2026-11-16', (up['date'], lw['date']))
    ok('maandag toont lower', 'Gym lower' in page.inner_text('main'))
    # kruis bij lower maandag
    page.locator('.card.s', has_text='Gym lower').locator('[data-act=miss]').click()
    page.wait_for_selector('.sheet .opt')
    page.screenshot(path='/tmp/s4_miss.png', full_page=True)
    optxt = page.inner_text('.sheet')
    ok('miss toont opties met aanbeveling', 'Overslaan' in optxt and 'Aanbevolen' in optxt, optxt)
    page.click('.sheet [data-act=closesheet]')

    # week-tab
    page.click('nav [data-tab=week]')
    page.wait_for_selector('.day')
    ok('week toont 7 dagen', page.locator('.day').count()==7)
    page.screenshot(path='/tmp/s5_week.png', full_page=True)
    # terug naar basisweek
    page.click('[data-act=resetopen]'); page.wait_for_selector('.sheet h3')
    page.screenshot(path='/tmp/s6_reset.png', full_page=True)
    page.click('[data-act=resetgo]')
    S=st()
    ok('reset: lower weer zaterdag', [x for x in S['sched'] if x['id']=='LOWER-2026-11-21'][0]['date']=='2026-11-21')

    # extra activiteit
    page.click('nav [data-tab=today]')
    page.click('[data-act=extraopen]')
    page.fill('#exName','voetbal')
    page.click('[data-act=exset][data-k=heavy][data-v=zwaar]')
    page.click('[data-act=exset][data-k=legs][data-v=ja]')
    page.screenshot(path='/tmp/s7_extra.png', full_page=True)
    page.click('[data-act=expreview]'); page.wait_for_selector('.sheet h3')
    page.screenshot(path='/tmp/s8_extra_prev.png', full_page=True)
    ptxt = page.inner_text('.sheet')
    ok('extra preview', 'voetbal' in ptxt and 'Deze week' in ptxt, ptxt)
    page.click('[data-act=previewgo][data-m=repaired]')
    ok('extra toegevoegd', any(x.get('extra') and x['status']=='planned' for x in st()['sched']))

    # voortgang + mobiliteit
    page.click('nav [data-tab=progress]'); page.wait_for_selector('.stat')
    page.click('[data-act=mobopen]'); page.fill('#mbKnee','9'); page.fill('#mbHurk','20'); page.fill('#mbTrap','18'); page.click('[data-act=mobsave]')
    ok('mobiliteit opgeslagen', len(st()['mobility'])==1)
    page.screenshot(path='/tmp/s9_progress.png', full_page=True)

    # ochtendblok afvinken + timers
    page.click('nav [data-tab=today]')
    page.check('#m-warm')
    ok('ochtend warm opgeslagen', st()['morning']['2026-11-16']['warm']==1)
    page.click('[data-act=timer][data-kind=calf]')
    page.wait_for_selector('#timer:not(.hidden)')
    t0 = page.inner_text('#tmBig'); page.clock.run_for(5000); t1 = page.inner_text('#tmBig')
    ok('timer loopt', t0!=t1, (t0,t1))
    page.screenshot(path='/tmp/s10_timer.png')
    page.clock.run_for(31000)
    ok('timer volgende stap', 'gebogen' in page.inner_text('#timer'), page.inner_text('#timer'))
    page.click('[data-act=tmstop]')
    ok('timer gesloten', page.locator('#timer.hidden').count()==1)

    # meer + backup roundtrip
    page.click('nav [data-tab=more]'); page.wait_for_selector('#importBox')
    page.screenshot(path='/tmp/s11_more.png', full_page=True)
    exp = page.evaluate('JSON.stringify({app:"training",data:window.__app.state})')
    before = st()
    page.fill('#importBox', exp); page.click('[data-act=import]'); page.click('[data-act=importgo]')
    ok('back-up terugzetten', json.dumps(st()['sched'],sort_keys=True)==json.dumps(before['sched'],sort_keys=True))

    # offline
    page.wait_for_timeout(500)
    ctx.set_offline(True)
    page.reload(); page.wait_for_selector('.card, .day', timeout=8000)
    ok('offline herladen werkt en bewaart data', page.evaluate('!!window.__app.state') and len(st()['mobility'])==1)
    ctx.set_offline(False)
    ok('geen console-fouten', not errs, errs)
    b.close()
print('\n%d/%d geslaagd' % (sum(1 for _,c in results if c), len(results)))
sys.exit(0 if all(c for _,c in results) else 1)
