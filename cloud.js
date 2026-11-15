// cloud.js - Hệ thống Tài khoản & Lưu/Tải Cloud Database qua Supabase
(function () {
    const SUPABASE_URL = 'https://nirzeodvrldnudfstzki.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_rp_J9VZb-ugXDPZGCRP4aQ_B0GeZDF7';
    const STORAGE_KEY = '5am.cloudSession';

    function toAuthEmail(input) {
        const clean = String(input || '').trim();
        if (!clean) return '';
        if (clean.includes('@')) return clean.toLowerCase();
        const safeUser = clean.toLowerCase().replace(/[^a-z0-9._-]/g, '');
        return safeUser ? `${safeUser}@5amgame.com` : '';
    }

    function extractDisplayName(input, userObj) {
        if (userObj?.user_metadata?.username) return userObj.user_metadata.username;
        const clean = String(input || '').trim();
        if (clean.includes('@')) return clean.split('@')[0];
        return clean || 'Chủ Quán';
    }

    class CloudSaveManager {
        constructor() {
            this.session = null;
            this.slots = [null, null, null];
            this.activeSlot = 0;
            this.isBusy = false;
            this._restoreLocalSession();
        }

        _restoreLocalSession() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.access_token && parsed.user?.id) {
                        this.session = parsed;
                    }
                }
            } catch (_) {
                this.session = null;
            }
        }

        _persistSession(session) {
            this.session = session;
            try {
                if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
                else localStorage.removeItem(STORAGE_KEY);
            } catch (_) {}
        }

        isLoggedIn() {
            return Boolean(this.session?.access_token && this.session?.user?.id);
        }

        getUsername() {
            return this.session?.username || this.session?.user?.user_metadata?.username || 'Chủ Quán';
        }

        _headers(withAuth = false) {
            const h = {
                'apikey': SUPABASE_KEY,
                'Content-Type': 'application/json'
            };
            if (withAuth && this.session?.access_token) {
                h['Authorization'] = `Bearer ${this.session.access_token}`;
            }
            return h;
        }

        async _refreshSession() {
            if (!this.session?.refresh_token) return false;
            try {
                const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
                    method: 'POST',
                    headers: this._headers(false),
                    body: JSON.stringify({ refresh_token: this.session.refresh_token })
                });
                if (!res.ok) return false;
                const data = await res.json();
                if (!data.access_token) return false;
                this._persistSession({
                    access_token: data.access_token,
                    refresh_token: data.refresh_token || this.session.refresh_token,
                    user: data.user || this.session.user,
                    username: this.getUsername()
                });
                return true;
            } catch (_) {
                return false;
            }
        }

        async signUp(usernameOrEmail, password) {
            const email = toAuthEmail(usernameOrEmail);
            const username = String(usernameOrEmail || '').trim().split('@')[0];
            if (!email || password.length < 6) {
                return { ok: false, error: 'Tên đăng nhập không hợp lệ hoặc mật khẩu dưới 6 ký tự.' };
            }
            try {
                const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
                    method: 'POST',
                    headers: this._headers(false),
                    body: JSON.stringify({
                        email,
                        password,
                        data: { username }
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    return { ok: false, error: data.msg || data.error_description || data.message || 'Đăng ký thất bại.' };
                }
                if (data.access_token && data.user) {
                    this._persistSession({
                        access_token: data.access_token,
                        refresh_token: data.refresh_token,
                        user: data.user,
                        username: extractDisplayName(usernameOrEmail, data.user)
                    });
                    this.slots = [null, null, null];
                    this.activeSlot = 0;
                    return { ok: true };
                }
                // Nếu dự án bật Confirm Email
                return { ok: false, error: 'Tài khoản đã tạo! Vui lòng xác nhận email hoặc tắt Confirm email trong Supabase.' };
            } catch (err) {
                return { ok: false, error: 'Không thể kết nối máy chủ Supabase.' };
            }
        }

        async signIn(usernameOrEmail, password) {
            const email = toAuthEmail(usernameOrEmail);
            if (!email || !password) {
                return { ok: false, error: 'Vui lòng nhập đầy đủ tài khoản và mật khẩu.' };
            }
            try {
                const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
                    method: 'POST',
                    headers: this._headers(false),
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (!res.ok || !data.access_token) {
                    return { ok: false, error: data.error_description || data.msg || 'Sai tài khoản hoặc mật khẩu.' };
                }
                this._persistSession({
                    access_token: data.access_token,
                    refresh_token: data.refresh_token,
                    user: data.user,
                    username: extractDisplayName(usernameOrEmail, data.user)
                });
                await this.loadGame();
                return { ok: true };
            } catch (_) {
                return { ok: false, error: 'Không thể kết nối máy chủ Supabase.' };
            }
        }

        signOut() {
            this.slots = [null, null, null];
            this.activeSlot = 0;
            this._persistSession(null);
        }

        async saveSlot(slotIndex, saveData) {
            if (!this.isLoggedIn()) return { ok: false, error: 'Chưa đăng nhập.' };
            const idx = Math.max(0, Math.min(2, Number(slotIndex) || 0));
            this.activeSlot = idx;
            this.slots[idx] = saveData;
            return this._syncSlotsToCloud();
        }

        async deleteSlot(slotIndex) {
            if (!this.isLoggedIn()) return { ok: false, error: 'Chưa đăng nhập.' };
            const idx = Math.max(0, Math.min(2, Number(slotIndex) || 0));
            this.slots[idx] = null;
            return this._syncSlotsToCloud();
        }

        async _syncSlotsToCloud() {
            this.isBusy = true;
            try {
                const payload = {
                    user_id: this.session.user.id,
                    username: this.getUsername(),
                    save_data: { activeSlot: this.activeSlot, slots: this.slots },
                    updated_at: new Date().toISOString()
                };
                let res = await fetch(`${SUPABASE_URL}/rest/v1/player_saves?on_conflict=user_id`, {
                    method: 'POST',
                    headers: {
                        ...this._headers(true),
                        'Prefer': 'resolution=merge-duplicates,return=minimal'
                    },
                    body: JSON.stringify(payload)
                });
                if (res.status === 401 && await this._refreshSession()) {
                    res = await fetch(`${SUPABASE_URL}/rest/v1/player_saves?on_conflict=user_id`, {
                        method: 'POST',
                        headers: {
                            ...this._headers(true),
                            'Prefer': 'resolution=merge-duplicates,return=minimal'
                        },
                        body: JSON.stringify(payload)
                    });
                }
                if (!res.ok) {
                    const errText = await res.text();
                    return { ok: false, error: errText || 'Lỗi lưu dữ liệu.' };
                }
                return { ok: true };
            } catch (_) {
                return { ok: false, error: 'Mất kết nối khi lưu Cloud.' };
            } finally {
                this.isBusy = false;
            }
        }

        async loadGame() {
            if (!this.isLoggedIn()) return null;
            try {
                const uid = encodeURIComponent(this.session.user.id);
                let res = await fetch(`${SUPABASE_URL}/rest/v1/player_saves?user_id=eq.${uid}&select=save_data,username,updated_at`, {
                    method: 'GET',
                    headers: this._headers(true)
                });
                if (res.status === 401 && await this._refreshSession()) {
                    res = await fetch(`${SUPABASE_URL}/rest/v1/player_saves?user_id=eq.${uid}&select=save_data,username,updated_at`, {
                        method: 'GET',
                        headers: this._headers(true)
                    });
                }
                if (!res.ok) return null;
                const rows = await res.json();
                if (Array.isArray(rows) && rows.length > 0 && rows[0].save_data && Object.keys(rows[0].save_data).length > 0) {
                    const sd = rows[0].save_data;
                    if (Array.isArray(sd.slots)) {
                        this.slots = [sd.slots[0] || null, sd.slots[1] || null, sd.slots[2] || null];
                        this.activeSlot = Math.max(0, Math.min(2, Number(sd.activeSlot) || 0));
                    } else {
                        this.slots = [sd, null, null];
                        this.activeSlot = 0;
                    }
                    return this.slots;
                }
                this.slots = [null, null, null];
                this.activeSlot = 0;
                return this.slots;
            } catch (_) {
                return null;
            }
        }
    }

    window.GameCloud = new CloudSaveManager();
})();
