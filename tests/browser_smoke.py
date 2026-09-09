#!/usr/bin/env python3
"""Browser UI and optional real, four-peer WebRTC smoke tests.

Requires the development-only Python package playwright and a Chromium browser.
By default HTML is loaded into blank browser documents. Use --url to verify an
actual hosted/file origin and its real persistence behavior. No fake RTC is used.
A blocked WebRTC route is reported as SKIP, never PASS. --require-p2p makes that
condition a failure. Report output records the exact scope of this run.
"""
import argparse
import asyncio
import json
import shutil
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
REPORT = []
ERRORS = []


def record(name, status='PASS', detail=''):
    item = {'test': name, 'status': status, 'detail': detail}
    REPORT.append(item)
    print(f'{status}: {name}' + (f' -- {detail}' if detail else ''), flush=True)


async def main(args):
    html = (ROOT / 'index.html').read_text(encoding='utf-8').replace(
        "if(new URLSearchParams(location.search).has('test'))", 'if(true)')
    args.out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        options = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage',
                   '--disable-background-timer-throttling', '--disable-renderer-backgrounding']}
        executable = args.chromium or shutil.which('chromium') or shutil.which('google-chrome')
        if executable:
            options['executable_path'] = executable
        browser = await playwright.chromium.launch(**options)

        async def load(width=1440, height=1000, mobile=False):
            context = await browser.new_context(viewport={'width': width, 'height': height},
                                                has_touch=mobile, is_mobile=mobile)
            page = await context.new_page()
            page.on('pageerror', lambda error: ERRORS.append(str(error)))
            page.on('dialog', lambda dialog: dialog.accept())
            if args.url:
                url = args.url + ('&' if '?' in args.url else '?') + 'test'
                await page.goto(url, wait_until='load')
            else:
                await page.set_content(html, wait_until='load')
            await page.wait_for_function('!!window.__orbit')
            return page

        page = await load()
        assert await page.locator('[data-level="1"]').is_disabled()
        record('Campaign initially locks later sectors')
        await page.screenshot(path=str(args.out / 'desktop-menu.png'), full_page=True)
        await page.click('#overlayAction')
        assert await page.evaluate('__orbit.game.s.mode') == 'campaign'
        record('Launch button starts a real campaign simulation')
        await page.evaluate('__orbit.game.s.timer = 20')
        initial = await page.evaluate('__orbit.game.s.players[0].a')
        await page.locator('#arena').focus()
        await page.keyboard.down('KeyD')
        await page.wait_for_timeout(230)
        await page.keyboard.up('KeyD')
        final = await page.evaluate('__orbit.game.s.players[0].a')
        assert abs(final - initial) > .2
        record('Keyboard input rotates the actual paddle')
        await page.keyboard.press('Space')
        assert await page.evaluate('__orbit.game.s.phase') == 'pause'
        await page.keyboard.press('Space')
        assert await page.evaluate('__orbit.game.s.phase') == 'countdown'
        record('Space pauses and resumes the previous phase')
        await page.evaluate('''() => {
          const g=__orbit.game; g.s.phase='play';
          for(let i=0;i<g.s.goal;i++)g.hit([-1,0]);
        }''')
        await page.wait_for_function('__orbit.profile.stars[0]===3')
        assert not await page.locator('[data-level="1"]').is_disabled()
        assert await page.evaluate('__orbit.profile.xp') >= 210
        record('Completing a sector awards stars, XP and the next unlock')
        await page.click('#overlayAction')
        assert await page.evaluate('__orbit.game.s.level') == 1
        record('Next-sector action starts the next campaign level')

        await page.evaluate('__orbit.chooseTab("arcade",true)')
        await page.click('[data-dimension="3"]')
        await page.click('#assistRow')
        assert await page.locator('#manualDepth').is_visible()
        await page.click('#mainAction')
        await page.evaluate('__orbit.game.s.timer=20')
        assert await page.evaluate('__orbit.game.s.ball.p.length') == 3
        initial_b = await page.evaluate('__orbit.game.s.players[0].b')
        await page.locator('#arena').focus()
        await page.keyboard.down('KeyW')
        await page.wait_for_timeout(200)
        await page.keyboard.up('KeyW')
        assert await page.evaluate('__orbit.game.s.players[0].b') > initial_b + .15
        record('3D mode uses XYZ state and manual Z controls')
        await page.evaluate('__orbit.returnToLobby()')
        await page.click('[data-dimension="4"]')
        await page.click('#mainAction')
        await page.evaluate('__orbit.game.s.timer=20')
        assert await page.evaluate('__orbit.game.s.ball.p.length') == 4
        await page.locator('#arena').focus()
        await page.keyboard.down('KeyE')
        await page.wait_for_timeout(200)
        await page.keyboard.up('KeyE')
        assert await page.evaluate('__orbit.game.s.players[0].c') > .15
        record('4D mode uses XYZW state and manual W controls')
        await page.screenshot(path=str(args.out / 'hypersphere-playing.png'), full_page=True)
        await page.evaluate('__orbit.chooseTab("local",true)')
        await page.select_option('#playerCount', '4')
        await page.click('#mainAction')
        await page.evaluate('__orbit.game.s.timer=20')
        assert await page.evaluate('__orbit.game.s.players.length') == 4
        assert not await page.evaluate('__orbit.game.s.players.some(p=>p.bot)')
        record('Four-player local mode creates four human paddles')
        before = await page.evaluate('__orbit.game.s.players.map(p=>p.a)')
        await page.locator('#arena').focus()
        for key in ['KeyD', 'ArrowRight', 'KeyL', 'KeyN']:
            await page.keyboard.down(key)
        await page.wait_for_timeout(240)
        for key in ['KeyD', 'ArrowRight', 'KeyL', 'KeyN']:
            await page.keyboard.up(key)
        after = await page.evaluate('__orbit.game.s.players.map(p=>p.a)')
        assert all(abs(a - b) > .15 for a, b in zip(after, before))
        record('All four local keyboard control sets move independently')
        await page.evaluate('__orbit.chooseTab("arcade",true)')
        await page.select_option('#arcadeType', 'survival')
        await page.click('#mainAction')
        assert await page.evaluate('__orbit.game.s.players.length') == 1
        assert await page.evaluate('__orbit.game.s.players[0].lives') == 1
        record('Survival has one pilot and one life')
        await page.click('#settingsButton')
        assert await page.locator('#settingsDialog').is_visible()
        assert await page.evaluate('__orbit.game.s.phase') == 'pause'
        await page.click('[data-close="settingsDialog"]')
        record('Opening settings pauses local gameplay')

        for width, height in [(320, 760), (390, 844), (768, 1024), (1366, 768)]:
            device = await load(width, height, width < 500)
            assert await device.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            await device.screenshot(path=str(args.out / f'layout-{width}.png'), full_page=True)
            await device.click('[data-tab="online"]')
            await device.click('#openRoomButton')
            assert await device.evaluate('document.getElementById("roomDialog").scrollWidth <= document.getElementById("roomDialog").clientWidth + 1')
            record(f'Layout and room dialog fit a {width}px viewport')
            await device.context.close()

        mobile = await load(390, 844, True)
        await mobile.click('[data-tab="local"]')
        await mobile.select_option('#playerCount', '2')
        await mobile.click('#mainAction')
        await mobile.evaluate('__orbit.game.s.timer=30')
        coords = await mobile.evaluate('''() => {
          const s=__orbit.game.s, r=__orbit.renderer, rect=document.getElementById('arena').getBoundingClientRect();
          return s.players.map(p=>{const v=r.project(__orbit.E.vector(p.a,p.b,p.c,s.n),s.n);return {x:rect.left+v.x,y:rect.top+v.y};});
        }''')
        for index, pos in enumerate(coords):
            await mobile.dispatch_event('#arena', 'pointerdown', {'pointerId': index+10, 'pointerType': 'touch',
                'clientX': pos['x'], 'clientY': pos['y'], 'button': 0, 'buttons': 1})
        rect = await mobile.locator('#arena').bounding_box()
        await mobile.dispatch_event('#arena', 'pointermove', {'pointerId': 10, 'pointerType': 'touch',
            'clientX': rect['x']+rect['width']/2, 'clientY': rect['y']+50, 'buttons': 1})
        await mobile.dispatch_event('#arena', 'pointermove', {'pointerId': 11, 'pointerType': 'touch',
            'clientX': rect['x']+rect['width']/2, 'clientY': rect['y']+rect['height']-50, 'buttons': 1})
        values = await mobile.evaluate('[__orbit.playerInput(0).a,__orbit.playerInput(1,1).a]')
        assert values[0] is not None and values[1] is not None and abs(values[0]-values[1]) > 1
        record('Synthetic multitouch assigns two distinct paddle targets')
        await mobile.context.close()

        async def make_room_page(name):
            p = await load(1280, 900)
            await p.click('[data-tab="online"]')
            await p.click('#openRoomButton')
            await p.fill('#pilotName', name)
            return p

        host = await make_room_page('Aster')
        await host.click('#createRoom')
        await host.wait_for_function('''document.getElementById('signalOut').value.startsWith('OP2.') ||
            document.getElementById('networkStatus').classList.contains('error')''', timeout=25000)
        offer = await host.input_value('#signalOut')
        if not offer:
            reason = await host.text_content('#networkStatus')
            assert await host.evaluate('__orbit.room.peers.size') == 0
            record('Unavailable ICE routes show an actionable error and release the seat')
            await host.screenshot(path=str(args.out / 'room-route-unavailable.png'), full_page=True)
            record('Real four-browser WebRTC connection', 'SKIP', reason)
            if args.require_p2p:
                raise AssertionError('Real P2P is required but this browser did not expose routes.')
        else:
            guests = []
            for seat in range(1, 4):
                if seat > 1:
                    await host.evaluate('document.getElementById("signalOut").value=""')
                    await host.click('#newInvite')
                    await host.wait_for_function('document.getElementById("signalOut").value.startsWith("OP2.")')
                    offer = await host.input_value('#signalOut')
                guest = await make_room_page(['', 'Lyra', 'Nova', 'Echo'][seat])
                await guest.click('#joinTab')
                await guest.fill('#signalIn', offer)
                await guest.click('#joinRoom')
                await guest.wait_for_function('''document.getElementById('signalOut').value.startsWith('OP2.') ||
                    document.getElementById('networkStatus').classList.contains('error')''', timeout=25000)
                reply = await guest.input_value('#signalOut')
                assert reply, await guest.text_content('#networkStatus')
                await host.fill('#signalIn', reply)
                await host.click('#acceptReply')
                await host.wait_for_function(f'__orbit.room.peers.get({seat})?.open', timeout=40000)
                await guest.wait_for_function('__orbit.room.peers.get(0)?.open', timeout=40000)
                assert not await host.evaluate('__orbit.room.canStart()')
                await guest.click('#readyButton')
                guests.append(guest)
            await host.wait_for_function('__orbit.room.canStart()')
            assert await host.locator('#newInvite').is_disabled()
            record('Real WebRTC: three independent guest contexts connect and ready up')
            await host.select_option('#roomDimension', '4')
            await host.screenshot(path=str(args.out / 'room-lobby.png'), full_page=True)
            await host.click('#startRoom')
            for guest in guests:
                await guest.wait_for_function('__orbit.remote?.n===4 && __orbit.remote.players.length===4')
            record('Real WebRTC: four-player 4D match synchronizes')
            guest = guests[0]
            await guest.locator('#arena').focus()
            await guest.keyboard.down('KeyD')
            await host.wait_for_function('__orbit.room.peers.get(1).input.x===1')
            await guest.keyboard.up('KeyD')
            record('Real WebRTC: remote keyboard input arrives at the authoritative host')
            await host.evaluate('__orbit.game.pause();__orbit.room.snapshot(__orbit.game.snapshot(),true)')
            for g in guests:
                await g.wait_for_function('__orbit.remote.phase==="pause"')
            record('Real WebRTC: reliable shared pause reaches every guest')
            await guests[0].evaluate('__orbit.room.chat("Hello <crew>!")')
            for p in [host, *guests]:
                await p.wait_for_function('document.getElementById("chatLog").textContent.includes("Hello <crew>!")')
            record('Real WebRTC: room chat is relayed as literal text')
            await host.evaluate('__orbit.room.close()')
            for g in guests:
                await g.wait_for_function('__orbit.room.role==="none"', timeout=15000)
            record('Real WebRTC: host departure closes every guest session')
        assert not ERRORS, '\n'.join(ERRORS)
        record('No uncaught JavaScript exceptions during browser smoke tests')
        await browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', help='Existing hosted or file URL; test mode is appended.')
    parser.add_argument('--chromium', help='Chromium executable path.')
    parser.add_argument('--out', type=Path, default=ROOT/'test-output')
    parser.add_argument('--require-p2p', action='store_true', help='Treat unavailable P2P routes as a failure.')
    args = parser.parse_args()
    error = None
    try:
        asyncio.run(main(args))
    except Exception as exc:
        record('Browser smoke run', 'FAIL', str(exc))
        error = exc
    finally:
        args.out.mkdir(parents=True, exist_ok=True)
        report = {'document_loading': args.url or 'HTML injected into blank browser documents',
                  'tests': REPORT, 'uncaught_js_errors': ERRORS}
        (args.out/'browser-results.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    if error:
        raise error
