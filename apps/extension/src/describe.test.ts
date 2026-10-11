import { beforeEach, describe, expect, it } from 'vitest';
import { describeClick } from './describe';

const html = (markup: string) => {
  document.body.innerHTML = markup;
};
const hit = (selector: string) => document.querySelector(selector);

describe('what a click was on', () => {
  beforeEach(() => html(''));

  it('names a button by its text, even when the click landed on something inside it', () => {
    html('<button id="b"><span id="s">  Invite   people </span></button>');
    expect(describeClick(hit('#s'))).toEqual({ kind: 'button', label: 'Invite people' });
    expect(describeClick(hit('#b'))).toEqual({ kind: 'button', label: 'Invite people' });
  });

  it('prefers aria-label, as for an icon button', () => {
    html('<button aria-label="Close dialog"><svg></svg>×</button>');
    expect(describeClick(hit('button'))).toEqual({ kind: 'button', label: 'Close dialog' });
  });

  it('names an icon-only button after the picture inside it', () => {
    html('<button><img alt="Settings" src="x.png"></button>');
    expect(describeClick(hit('img'))).toEqual({ kind: 'button', label: 'Settings' });
  });

  it('names a link by its text', () => {
    html('<a href="/x"><b>Sign in</b></a>');
    expect(describeClick(hit('b'))).toEqual({ kind: 'link', label: 'Sign in' });
  });

  it('names a text field by its label, and never reads what was typed', () => {
    html('<label for="e">Email</label><input id="e" type="text" value="me@secret.example">');
    const result = describeClick(hit('input'));
    expect(result).toEqual({ kind: 'field', label: 'Email' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('falls back to a placeholder for a field with no label, and never to the value', () => {
    html('<input type="password" placeholder="Password" value="hunter2">');
    expect(describeClick(hit('input'))).toEqual({ kind: 'field', label: 'Password' });
    html('<input type="text" value="hunter2">');
    expect(describeClick(hit('input')).label).toBe('');
  });

  it('names a submit input by its caption', () => {
    html('<input type="submit" value="Save changes">');
    expect(describeClick(hit('input'))).toEqual({ kind: 'button', label: 'Save changes' });
  });

  it('follows aria-labelledby', () => {
    html('<span id="n">Billing</span><div role="button" aria-labelledby="n">…</div>');
    expect(describeClick(hit('[role=button]'))).toEqual({ kind: 'button', label: 'Billing' });
  });

  it('gives short text on a non-control, and nothing for a long block', () => {
    html('<h2>Team settings</h2><p id="p">' + 'word '.repeat(40) + '</p>');
    expect(describeClick(hit('h2'))).toEqual({ kind: 'other', label: 'Team settings' });
    expect(describeClick(hit('#p')).label).toBe('');
  });
});
