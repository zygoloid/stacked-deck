// Signing in and the account's dialogs (docs/online.md, "Signing in"):
// signing in is the opt-in, so the sign-in dialog first says what is stored.
// Dialogs go in #dialog, above everything else, and keep their keys to
// themselves (so the editor's shortcuts don't fire while typing a nickname).
import { h } from './dom.js';
import { cleanName } from '../online.js';

const host = () => document.getElementById('dialog');
export const dialogOpen = () => !!host()?.firstChild;

// Show a dialog; `build(close)` returns its content. Resolves with the value
// passed to close() (undefined when dismissed).
function dialog(build, { dismissable = true } = {}) {
  return new Promise((resolve) => {
    const close = (value) => { host().replaceChildren(); resolve(value); };
    const back = h('div', {
      class: 'modal-back dialog-back',
      onclick: (e) => { if (dismissable && e.target === e.currentTarget) close(); },
      onkeydown: (e) => {
        e.stopPropagation();
        if (e.key === 'Escape' && dismissable) close();
      },
    }, h('div', { class: 'modal dialog', role: 'dialog', 'aria-modal': 'true' }, build(close)));
    host().replaceChildren(back);
    (back.querySelector('input') ?? back.querySelector('.btn.gold') ?? back.querySelector('button'))?.focus();
  });
}

// What signing in does, then Google's popup. The SDK starts loading when the
// dialog opens, so the popup can open straight from the button's click
// (browsers block popups opened later).
export function signInDialog(cloud) {
  return dialog((close) => {
    const status = h('p', { class: 'muted small dlg-status' }, '');
    const go = h('button', {
      class: 'btn gold', disabled: !cloud.ready(),
      onclick: () => {
        status.textContent = 'Waiting for Google…';
        go.disabled = true;
        cloud.signIn().then(() => close(true), (e) => {
          go.disabled = false;
          status.textContent = /popup-closed|cancelled-popup/.test(e?.code ?? '') ? '' : `Couldn't sign in (${e?.code ?? e?.message ?? e}).`;
        });
      },
    }, cloud.ready() ? 'Sign in with Google' : 'Loading…');
    if (!cloud.ready()) {
      cloud.preload().then(() => { go.disabled = false; go.textContent = 'Sign in with Google'; },
        () => { status.textContent = 'Couldn\'t reach the sign-in service. Try again later.'; });
    }
    return [
      h('h2', {}, 'Sign in to compare'),
      h('p', {}, 'Signing in with Google turns on the online features. Until you sign in, nothing about you or your game leaves this browser.'),
      h('h3', {}, 'What signing in stores'),
      h('ul', { class: 'dlg-list' },
        h('li', {}, 'The machines you have solved floors with, and their scores, are uploaded to your account. Your machines are never shown to anyone else.'),
        h('li', {}, 'Your scores join each floor\'s chart of everyone\'s scores, which shows only how many players got each score, never who.'),
        h('li', {}, 'A nickname you choose. Nobody else sees it yet; later, friends you invite will see it next to your scores.'),
        h('li', {}, 'Google tells the sign-in service your name and email address. Other players never see them.')),
      h('p', { class: 'muted small' }, 'You can sign out, or delete everything signing in stored, at any time from the account menu.'),
      h('div', { class: 'modal-actions' }, go, h('button', { class: 'btn ghost', onclick: () => close(false) }, 'Not now')),
      status,
    ];
  });
}

// A nickname for the account. Resolves with it, or null for "later".
export function askName(current = '') {
  return dialog((close) => {
    const input = h('input', { class: 'dlg-input', maxlength: 40, value: current, placeholder: 'e.g. Ace of Clubs', 'aria-label': 'Nickname' });
    const err = h('p', { class: 'muted small dlg-status' }, '');
    const ok = () => {
      const name = cleanName(input.value);
      if (!name) { err.textContent = 'Choose a nickname (up to 40 characters).'; return; }
      close(name);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    return [
      h('h2', {}, current ? 'Change nickname' : 'Choose a nickname'),
      h('p', {}, 'This is the only name the game ever shows for you. It isn\'t taken from your Google account.'),
      input, err,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn gold', onclick: ok }, 'Save'),
        h('button', { class: 'btn ghost', onclick: () => close(null) }, current ? 'Cancel' : 'Later')),
    ];
  }).then((v) => v ?? null);
}

// This browser's progress was saved with a different account.
export function confirmOtherAccount() {
  return dialog((close) => [
    h('h2', {}, 'Progress from another account'),
    h('p', {}, 'The progress saved in this browser belongs to a different account. Do you want to add it to the account you just signed in with, or clear it from this browser and start from this account\'s progress?'),
    h('div', { class: 'modal-actions' },
      h('button', { class: 'btn gold', onclick: () => close('merge') }, 'Add it to this account'),
      h('button', { class: 'btn', onclick: () => close('clear') }, 'Clear this browser'),
      h('button', { class: 'btn ghost', onclick: () => close('cancel') }, 'Cancel and sign out')),
  ], { dismissable: false });
}

// The account menu (signed in): nickname, sign out.
export function accountDialog(cloud) {
  return dialog((close) => {
    const u = cloud.user();
    return [
      h('h2', {}, u?.name ? `Signed in as ${u.name}` : 'Signed in'),
      h('p', { class: 'muted' }, 'Your progress is saved to your account, and each floor\'s chart shows everyone\'s scores and your friends\'.'),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: () => close('friends') }, 'Friends…'),
        h('button', { class: 'btn', onclick: () => close('name') }, u?.name ? 'Change nickname' : 'Choose a nickname'),
        h('button', { class: 'btn', onclick: () => close('signout') }, 'Sign out'),
        h('button', { class: 'btn ghost', onclick: () => close() }, 'Close')),
      h('p', { class: 'dlg-danger-row' }, h('button', { class: 'btn ghost small danger', onclick: () => close('delete') }, 'Delete my data…')),
    ];
  }).then(async (choice) => {
    if (choice === 'name') {
      const name = await askName(cloud.user()?.name ?? '');
      if (name) await cloud.setName(name).catch((e) => console.warn('nickname:', e));
    } else if (choice === 'signout') {
      await signOutDialog(cloud);
    } else if (choice === 'delete') {
      await deleteDialog(cloud);
    } else if (choice === 'friends') {
      await friendsDialog(cloud);
    }
  });
}

const errText = (e) => e?.message || e?.code || String(e);

// Friends: the list (each can be removed) and making an invite link.
export function friendsDialog(cloud) {
  return dialog((close) => {
    const list = h('div', { class: 'friend-list' }, h('p', { class: 'muted small' }, 'Loading…'));
    const inviteBox = h('div', { class: 'invite-box' });
    const status = h('p', { class: 'muted small dlg-status' }, '');
    const showList = () => cloud.friends({ reread: true }).then((fs) => {
      list.replaceChildren(...(fs.length ? fs.map((f) => h('div', { class: 'friend-row' },
        h('span', { class: 'friend-name' }, f.name ?? 'A player with no nickname yet'),
        h('button', {
          class: 'btn ghost small', title: 'Stop being friends: neither of you sees the other\'s scores any more',
          onclick: async (e) => {
            if (!confirm(`Remove ${f.name ?? 'this friend'}? Neither of you will see the other's scores.`)) return;
            e.currentTarget.disabled = true;
            try { await cloud.removeFriend(f.uid); showList(); } catch (err) { status.textContent = `Couldn't remove (${errText(err)}).`; }
          },
        }, 'Remove'))) : [h('p', { class: 'muted' }, 'No friends yet. Invite someone with a link.')]));
    }, (e) => list.replaceChildren(h('p', { class: 'muted' }, `Couldn't load your friends (${errText(e)}).`)));
    showList();
    const invite = h('button', {
      class: 'btn gold',
      onclick: async () => {
        if (!cloud.user()?.name) {
          const name = await askName();
          if (!name || !(await cloud.setName(name).catch(() => false))) { status.textContent = 'Friends see your nickname, so choose one first.'; return; }
          friendsDialog(cloud); // the nickname dialog replaced this one
          return;
        }
        invite.disabled = true;
        status.textContent = 'Making an invite…';
        try {
          const { code, expires } = await cloud.createInvite();
          const link = `${location.origin}${location.pathname}#invite=${code}`;
          const field = h('input', { class: 'dlg-input invite-link', readonly: true, value: link, 'aria-label': 'Invite link' });
          const copy = h('button', {
            class: 'btn',
            onclick: () => { field.select(); navigator.clipboard?.writeText(link).then(() => { copy.textContent = 'Copied'; }, () => {}); },
          }, 'Copy');
          inviteBox.replaceChildren(field, h('div', { class: 'modal-actions' }, copy),
            h('p', { class: 'muted small' }, `Send this to your friend. It works once, until ${new Date(expires).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, and anyone who has it can use it, so send it only to them. Making a new one cancels it.`));
          status.textContent = '';
        } catch (e) {
          status.textContent = `Couldn't make an invite (${errText(e)}).`;
        } finally {
          invite.disabled = false;
        }
      },
    }, 'Invite a friend');
    return [
      h('h2', {}, 'Friends'),
      h('p', { class: 'muted' }, 'Friends see each other\'s nicknames and best scores on each floor, never machines.'),
      list,
      h('div', { class: 'modal-actions' }, invite, h('button', { class: 'btn ghost', onclick: () => close() }, 'Close')),
      inviteBox, status,
    ];
  });
}

// Opening an invite link: sign in if needed, then show who it is from and
// accept only if the player says so.
export async function inviteFlow(cloud, code) {
  await Promise.race([cloud.settled(), new Promise((r) => setTimeout(r, 15000))]);
  if (cloud.state() !== 'signed-in') {
    const go = await dialog((close) => [
      h('h2', {}, 'An invite to be friends'),
      h('p', {}, 'Someone has invited you to be friends in Stacked Deck: you would see each other\'s nicknames and best scores. Sign in to see who it is from.'),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn gold', onclick: () => close(true) }, 'Sign in…'),
        h('button', { class: 'btn ghost', onclick: () => close(false) }, 'Not now')),
    ]);
    if (!go || !(await signInDialog(cloud))) return;
    // Wait for signing in to finish (nickname, merging progress).
    await new Promise((r) => setTimeout(r, 0));
    await cloud.whenReady();
    if (cloud.state() !== 'signed-in') return;
  }
  const message = (title, text) => dialog((close) => [
    h('h2', {}, title), h('p', {}, text),
    h('div', { class: 'modal-actions' }, h('button', { class: 'btn gold', onclick: () => close() }, 'OK')),
  ]);
  let who;
  try { who = await cloud.previewInvite(code); } catch (e) { await message('Invite not found', errText(e)); return; }
  const name = who.name ?? 'a player with no nickname yet';
  if (who.own) { await message('Your own invite', 'That\'s your own invite link: send it to a friend.'); return; }
  if (who.friends) { await message('Already friends', `You and ${name} are already friends.`); return; }
  const yes = await dialog((close) => [
    h('h2', {}, 'Accept invite?'),
    h('p', {}, 'Accept the invite from ', h('b', {}, name), '? You will see each other\'s nicknames and best scores on each floor (never machines). Either of you can end it from the Friends list.'),
    h('div', { class: 'modal-actions' },
      h('button', { class: 'btn gold', onclick: () => close(true) }, 'Accept'),
      h('button', { class: 'btn ghost', onclick: () => close(false) }, 'Decline')),
  ]);
  if (!yes) return;
  try {
    await cloud.acceptInvite(code);
  } catch (e) { await message('Couldn\'t accept', errText(e)); return; }
  if (!cloud.user()?.name) {
    const chosen = await askName();
    if (chosen) await cloud.setName(chosen).catch(() => {});
  }
  await message('Friends', `You and ${name} are now friends.`);
}

// Deleting everything signing in stored: the deleteMyData function, then the
// sign-in account itself. Resolves with true once deleted.
export function deleteDialog(cloud) {
  return dialog((close) => {
    const body = h('div', {});
    const clearBox = h('input', { type: 'checkbox', id: 'dlg-clear-local' });
    const status = h('p', { class: 'muted small dlg-status' }, '');
    const done = (cleared) => body.replaceChildren(
      h('h2', {}, 'Deleted'),
      h('p', {}, `Everything Stacked Deck stored online for you is gone, and you're signed out.${cleared ? ' This browser\'s progress is cleared too.' : ' Your progress in this browser is still here.'}`),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn gold', onclick: () => close(true) }, 'Close')));
    // Google can ask for a fresh sign-in before an account is deleted; the
    // popup has to open from a click, so it gets its own button.
    const confirm = (cleared) => body.replaceChildren(
      h('h2', {}, 'Confirm it\'s you'),
      h('p', {}, 'Your data is deleted. To delete the sign-in account too, Google needs you to confirm it\'s you.'),
      h('div', { class: 'modal-actions' }, h('button', {
        class: 'btn gold',
        onclick: (e) => {
          e.currentTarget.disabled = true;
          status.textContent = 'Waiting for Google…';
          cloud.reauthAndDelete().then(() => done(cleared), (err) => {
            e.target.disabled = false;
            status.textContent = `Couldn't confirm (${err?.code ?? err?.message ?? err}). Try again, or sign in again later and delete from the account menu.`;
          });
        },
      }, 'Confirm with Google')),
      status);
    const go = h('button', {
      class: 'btn danger',
      onclick: () => {
        go.disabled = true;
        status.textContent = 'Deleting…';
        const cleared = clearBox.checked;
        cloud.deleteAccount({ clearLocal: cleared }).then((r) => (r === 'reauth' ? confirm(cleared) : done(cleared)), (err) => {
          go.disabled = false;
          status.textContent = `Couldn't delete just now (${err?.code ?? err?.message ?? err}). Nothing changed in this browser; try again later.`;
        });
      },
    }, 'Delete everything');
    body.append(
      h('h2', {}, 'Delete my data'),
      h('p', {}, 'This deletes everything Stacked Deck stores online for this account, for good:'),
      h('ul', { class: 'dlg-list' },
        h('li', {}, 'your uploaded machines and their scores, which are also taken out of every floor\'s chart;'),
        h('li', {}, 'your nickname;'),
        h('li', {}, 'your sign-in account itself (signing in again later starts a new one).')),
      h('label', { class: 'dlg-check', for: 'dlg-clear-local' }, clearBox, ' Also clear this browser\'s progress (otherwise you keep playing here, signed out)'),
      h('div', { class: 'modal-actions' }, go, h('button', { class: 'btn ghost', onclick: () => close(false) }, 'Cancel')),
      status);
    return body;
  });
}

// Signing out: keep this browser's progress, or clear it (on a shared
// computer). Resolves with true if the save was cleared.
export async function signOutDialog(cloud) {
  const choice = await dialog((close) => [
    h('h2', {}, 'Sign out'),
    h('p', {}, 'Your progress stays in your account. Do you want to keep a copy in this browser too? On a shared computer, clear it.'),
    h('div', { class: 'modal-actions' },
      h('button', { class: 'btn', onclick: () => close('keep') }, 'Sign out, keep progress here'),
      h('button', { class: 'btn', onclick: () => close('clear') }, 'Sign out and clear this browser'),
      h('button', { class: 'btn ghost', onclick: () => close() }, 'Cancel')),
  ]);
  if (!choice) return false;
  await cloud.signOut({ clear: choice === 'clear' });
  return choice === 'clear';
}

// The account control for the floor select's header.
export function accountButton(cloud) {
  const st = cloud.state();
  if (st === 'starting') return h('button', { class: 'btn ghost small account', disabled: true }, 'Signing in…');
  if (st === 'signed-in') {
    const name = cloud.user()?.name;
    return h('button', { class: 'btn ghost small account signed-in', title: 'Account', onclick: () => accountDialog(cloud) },
      `☺ ${name || 'Signed in'}`);
  }
  return h('button', {
    class: 'btn ghost small account', title: 'Sign in to compare scores with other players',
    onclick: () => signInDialog(cloud),
  }, 'Sign in');
}
