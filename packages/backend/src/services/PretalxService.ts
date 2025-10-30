import { Logger } from '../utils/logger';
export type PretalxSpeaker = {
    code: string;
    name: string;
    biography?: string;
    answers?: Array<{ question?: { question?: string; slug?: string }; answer?: string }>;
} & Record<string, unknown>;

type PretalxExpandedSlot = {
    start?: string;
    end?: string;
    submission?: {
        speakers?: Array<PretalxSpeaker>;
    };
};

export class PretalxService {
    private readonly baseUrl: string;
    private readonly eventSlug: string;
    private readonly token: string;
    private readonly logger = new Logger('PretalxService');
    constructor(baseUrl: string, eventSlug: string, token: string) {
        this.baseUrl = baseUrl;
        this.eventSlug = eventSlug;
        this.token = token;
    }

    private async apiGet<T>(path: string): Promise<T> {
        const url = `${this.baseUrl.replace(/\/$/, '')}${path}`;
        // Debug log (URL only, token masked)
        this.logger.info(`GET ${url}`);
        const res = await fetch(url, {
            headers: {
                Authorization: `Token ${this.token}`,
                Accept: 'application/json'
            }
        } as RequestInit);
        if (!res.ok) {
            const body = await res.text();
            this.logger.error(`Pretalx API error ${res.status} for ${url}`);
            throw new Error(`Pretalx API error ${res.status}: ${body}`);
        }
        return res.json() as Promise<T>;
    }

    private async paginate<T>(path: string, key: string = 'results'): Promise<T[]> {
        const results: T[] = [];
        let urlPath: string | null = path;
        while (urlPath) {
            const page = await this.apiGet<Record<string, unknown> | T[]>(urlPath);
            if (Array.isArray(page)) {
                (page as T[]).forEach(x => results.push(x));
                break;
            }
            const items = (page as Record<string, unknown>)[key] as T[] | undefined;
            if (items?.length) items.forEach(x => results.push(x));
            const next = (page as Record<string, unknown>)['next'] as string | undefined;
            urlPath = next ? next.replace(this.baseUrl.replace(/\/$/, ''), '') : null;
        }
        return results;
    }

    private async fetchExpandedSlots(): Promise<PretalxExpandedSlot[]> {
        // Use latest schedule talk slots with expanded submission + speakers + answers
        const query = encodeURI('?expand=submission.speakers,submission.speakers.answers');
        return await this.paginate<PretalxExpandedSlot>(`/api/events/${this.eventSlug}/slots/${query}`);
    }

    public async checkEventAccessible(): Promise<{ slug: string; name?: unknown }> {
        // Basic call to validate token & event access
        const data = await this.apiGet<Record<string, unknown>>(`/api/events/${this.eventSlug}/`);
        return { slug: this.eventSlug, name: data?.['name'] };
    }

    private extractNoteFromSpeaker(s: PretalxSpeaker): string | null {
        // Heuristics: look for explicit note1 field, answers with question containing 'note', 'nostr', or values starting with 'note1'
        const direct = (s as unknown as Record<string, unknown>)['note1'];
        if (typeof direct === 'string' && direct.startsWith('note1')) return direct;

        if (Array.isArray(s.answers)) {
            for (const ans of s.answers) {
                const qText = ans?.question?.question?.toLowerCase() || ans?.question?.slug?.toLowerCase() || '';
                const val = (ans?.answer || '') as string;
                if (!val) continue;
                if (val.startsWith('note1')) return val;
                if (qText.includes('note') || qText.includes('nostr')) {
                    if (val.startsWith('note1')) return val;
                }
            }
        }
        const bio = (s.biography || '') as string;
        const match = bio.match(/(note1[0-9a-z]+)\b/i);
        if (match) return match[1];
        return null;
    }

    public async buildSlotsFromPretalx(): Promise<Array<{ startAt: string; endAt: string; items: Array<{ ref: string }> }>> {
        const expandedSlots = await this.fetchExpandedSlots();

        const slots: Array<{ startAt: string; endAt: string; items: Array<{ ref: string }> }> = [];
        for (const slot of expandedSlots) {
            if (!slot.start || !slot.end) continue; // skip unscheduled
            const noteSet = new Set<string>();
            const speakers = slot.submission?.speakers || [];
            for (const sp of speakers) {
                const note = this.extractNoteFromSpeaker(sp);
                if (note) noteSet.add(note);
            }
            const items = Array.from(noteSet).map(ref => ({ ref }));
            slots.push({ startAt: slot.start, endAt: slot.end, items });
        }
        slots.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
        return slots;
    }
}


