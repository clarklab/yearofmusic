import { createHmac, timingSafeEqual } from 'crypto';

// Server-side club sessions.
// Tokens are "{slug}.{expiresAt}.{signature}", signed with the club's password
// (plus AUTH_SECRET if set), so changing the password logs everyone out.

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_FAILED_LOGINS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export function isValidSlug(slug) {
    return typeof slug === 'string' && slug.length >= 2 && slug.length <= 30 && SLUG_REGEX.test(slug);
}

export function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

// Textbelt puts the API key in its "Out of quota" refill link - never store or return it
export function redactSecrets(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/key=[A-Za-z0-9_-]+/gi, 'key=REDACTED');
}

export function safeEqual(a, b) {
    const bufA = Buffer.from(String(a ?? ''));
    const bufB = Buffer.from(String(b ?? ''));
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function sign(payload, settings) {
    const key = `${process.env.AUTH_SECRET || ''}|${settings.password}|${settings.adminPhone || ''}`;
    return createHmac('sha256', key).update(payload).digest('base64url');
}

export function createToken(clubSlug, settings) {
    const payload = `${clubSlug}.${Date.now() + TOKEN_TTL_MS}`;
    return `${payload}.${sign(payload, settings)}`;
}

function verifyToken(token, clubSlug, settings) {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [slug, expiresAt, signature] = parts;
    if (slug !== clubSlug || !(Number(expiresAt) > Date.now())) return false;

    return safeEqual(signature, sign(`${slug}.${expiresAt}`, settings));
}

// Returns { settings } when the request carries a valid session for clubSlug,
// otherwise { response } with the error to send back.
export async function requireClubAuth(req, store, clubSlug) {
    if (!isValidSlug(clubSlug)) {
        return { response: jsonResponse({ error: 'Club slug is required' }, 400) };
    }

    const settings = await store.get(`club:${clubSlug}:settings`, { type: 'json' });
    if (!settings) {
        return { response: jsonResponse({ error: 'Club not found' }, 404) };
    }

    const header = req.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!verifyToken(token, clubSlug, settings)) {
        return { response: jsonResponse({ error: 'Not logged in' }, 401) };
    }

    return { settings };
}

// Check a club password (and admin phone, when given) with a lockout after
// repeated failures. Returns { ok, locked }.
export async function checkClubCredentials(store, clubSlug, settings, { password, phone }) {
    const failuresKey = `club:${clubSlug}:loginFailures`;
    const now = Date.now();

    let failures = await store.get(failuresKey, { type: 'json' });
    if (failures && now - failures.since > LOGIN_WINDOW_MS) {
        failures = null;
    }

    if (failures && failures.count >= MAX_FAILED_LOGINS) {
        return { ok: false, locked: true };
    }

    const passwordValid = safeEqual(password, settings.password);
    const phoneValid = phone === undefined || String(phone).replace(/\D/g, '') === settings.adminPhone;

    if (passwordValid && phoneValid) {
        if (failures) await store.delete(failuresKey);
        return { ok: true, locked: false };
    }

    await store.setJSON(failuresKey, {
        count: (failures?.count || 0) + 1,
        since: failures?.since || now
    });
    return { ok: false, locked: false };
}
