import { Logger } from '../utils/logger';
export type PretalxSpeaker = {
  code: string;
  name: string;
  biography?: string;
  answers?: Array<{
    question?: { question?: string; slug?: string };
    answer?: string;
  }>;
} & Record<string, unknown>;

type PretalxExpandedSlot = {
  start?: string;
  end?: string;
  submission?: {
    speakers?: Array<PretalxSpeaker>;
  };
};

type PretalxScheduleSlot = {
  start?: string;
  end?: string;
  room?: number | string | { id?: number | string; name?: unknown };
  submission?: {
    title?: string;
    speakers?: Array<PretalxSpeaker>;
  };
};

type PretalxScheduleExpanded = {
  version?: string;
  slots?: Array<{
    start?: string;
    end?: string;
    room?: number | string | { id?: number | string; name?: unknown };
    submission?: { speakers?: Array<PretalxSpeaker> };
  }>;
};

type PretalxTalk = {
  slot?: { start?: string; end?: string };
  speakers?: Array<PretalxSpeaker>;
};

type PretalxSubmission = {
  code?: string;
  slot?: { start?: string; end?: string };
  speakers?: Array<PretalxSpeaker>;
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
      this.logger.error(
        `Pretalx API error ${res.status} for ${url}: ${body.substring(0, 500)}`
      );
      throw new Error(
        `Pretalx API error ${res.status}: ${body.substring(0, 200)}`
      );
    }
    const data = (await res.json()) as T;
    // Log response structure for debugging
    if (Array.isArray(data)) {
      this.logger.debug(`API returned array with ${data.length} items`);
    } else if (data && typeof data === 'object' && 'results' in data) {
      const results = (data as { results?: unknown[] }).results || [];
      this.logger.debug(
        `API returned paginated response with ${results.length} results`
      );
    }
    return data;
  }

  private async paginate<T>(
    path: string,
    key: string = 'results'
  ): Promise<T[]> {
    const results: T[] = [];
    let urlPath: string | null = path;
    let pageNum = 1;
    while (urlPath) {
      this.logger.debug(`Fetching page ${pageNum} from ${urlPath}`);
      const page = await this.apiGet<Record<string, unknown> | T[]>(urlPath);
      if (Array.isArray(page)) {
        this.logger.debug(
          `Page ${pageNum}: got array with ${page.length} items`
        );
        (page as T[]).forEach(x => results.push(x));
        break;
      }
      const items = (page as Record<string, unknown>)[key] as T[] | undefined;
      if (items?.length) {
        this.logger.debug(
          `Page ${pageNum}: got ${items.length} items in '${key}' field`
        );
        items.forEach(x => results.push(x));
      } else {
        this.logger.warn(`Page ${pageNum}: no items found in '${key}' field`);
      }
      const next = (page as Record<string, unknown>)['next'] as
        | string
        | undefined;
      if (next) {
        urlPath = next.replace(this.baseUrl.replace(/\/$/, ''), '');
        pageNum++;
      } else {
        urlPath = null;
      }
    }
    this.logger.info(
      `Paginated fetch complete: ${results.length} total items across ${pageNum} page(s)`
    );
    return results;
  }

  public async fetchSchedulesList(): Promise<
    Array<{ id?: number | string; version?: string; published?: string | null }>
  > {
    const path = `/api/events/${this.eventSlug}/schedules/`;
    this.logger.info(`Fetching Pretalx schedules list from: ${path}`);
    const resp = await this.apiGet<Record<string, unknown>>(path);
    const results =
      (resp?.['results'] as Array<Record<string, unknown>> | undefined) || [];
    return results.map(r => ({
      id: r['id'] as number | string | undefined,
      version: r['version'] as string | undefined,
      published: (r['published'] as string | null | undefined) ?? null
    }));
  }

  private async fetchExpandedSlots(): Promise<PretalxExpandedSlot[]> {
    // Use latest schedule talk slots with expanded submission + speakers + answers
    const query = encodeURI(
      '?expand=submission.speakers,submission.speakers.answers'
    );
    const path = `/api/events/${this.eventSlug}/slots/${query}`;
    this.logger.info(`Fetching Pretalx slots from: ${path}`);
    try {
      const slots = await this.paginate<PretalxExpandedSlot>(path);
      this.logger.info(
        `Successfully fetched ${slots.length} slots from Pretalx API`
      );
      if (slots.length > 0) {
        // Log first slot structure for debugging
        this.logger.debug(
          `First slot sample: ${JSON.stringify({
            hasStart: !!slots[0].start,
            hasEnd: !!slots[0].end,
            hasSubmission: !!slots[0].submission,
            speakerCount: slots[0].submission?.speakers?.length || 0
          })}`
        );
      }
      return slots;
    } catch (error) {
      this.logger.error(
        `Failed to fetch Pretalx slots: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  private async fetchScheduleLatestSlots(): Promise<PretalxScheduleSlot[]> {
    // Use slots filtered by latest schedule version
    const expandQuery = encodeURI(
      '?schedule_version=latest&expand=submission.speakers,submission.speakers.answers'
    );
    const path = `/api/events/${this.eventSlug}/slots/${expandQuery}`;
    this.logger.info(`Fetching Pretalx latest slots from: ${path}`);
    return await this.paginate<PretalxScheduleSlot>(path);
  }

  public async fetchSlotsByVersion(
    version: string
  ): Promise<PretalxScheduleSlot[]> {
    // Filter slots by schedule_version per Pretalx API
    const query = encodeURI(
      `?schedule_version=${version}&expand=room,submission.speakers,submission.speakers.answers`
    );
    const path = `/api/events/${this.eventSlug}/slots/${query}`;
    this.logger.info(
      `Fetching Pretalx slots for version ${version} via slots list: ${path}`
    );
    const slots = await this.paginate<PretalxScheduleSlot>(path);
    this.logger.info(`Fetched ${slots.length} slots for version ${version}`);
    return slots;
  }

  public async fetchScheduleExpanded(
    idOrShortcut: string
  ): Promise<PretalxScheduleExpanded> {
    // idOrShortcut supports numeric id, 'latest', or 'wip'
    const query = encodeURI(
      '?expand=slots,slots.room,slots.submission.speakers'
    );
    const path = `/api/events/${this.eventSlug}/schedules/${idOrShortcut}/${query}`;
    this.logger.info(
      `Fetching Pretalx schedule ${idOrShortcut} expanded from: ${path}`
    );
    return await this.apiGet<PretalxScheduleExpanded>(path);
  }

  private async fetchTalks(): Promise<PretalxTalk[]> {
    // Talks endpoints often contain slot.start/end under talk.slot
    const query = encodeURI('?state=confirmed&expand=speakers,answers,slot');
    const path = `/api/events/${this.eventSlug}/talks/${query}`;
    this.logger.info(`Fetching Pretalx talks from: ${path}`);
    const talks = await this.paginate<PretalxTalk>(path);
    this.logger.info(`Fetched ${talks.length} talks`);
    return talks;
  }

  private async fetchSubmissions(): Promise<PretalxSubmission[]> {
    // Fetch submissions with slot and speakers expanded
    const query = encodeURI(
      '?state=confirmed&expand=speakers,speakers.answers,slot'
    );
    const path = `/api/events/${this.eventSlug}/submissions/${query}`;
    this.logger.info(`Fetching Pretalx submissions from: ${path}`);
    const submissions = await this.paginate<PretalxSubmission>(path);
    this.logger.info(`Fetched ${submissions.length} submissions`);
    return submissions;
  }

  public async checkEventAccessible(): Promise<{
    slug: string;
    name?: unknown;
  }> {
    // Basic call to validate token & event access
    const data = await this.apiGet<Record<string, unknown>>(
      `/api/events/${this.eventSlug}/`
    );
    return { slug: this.eventSlug, name: data?.['name'] };
  }

  private extractNoteFromSpeaker(s: PretalxSpeaker): string | null {
    // Heuristics: look for explicit note1 field, answers with question containing 'note', 'nostr', or values starting with 'note1'
    const direct = (s as unknown as Record<string, unknown>)['note1'];
    if (typeof direct === 'string' && direct.startsWith('note1')) return direct;

    if (Array.isArray(s.answers)) {
      for (const ans of s.answers) {
        const qText =
          ans?.question?.question?.toLowerCase() ||
          ans?.question?.slug?.toLowerCase() ||
          '';
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

  public async buildSlotsFromPretalx(): Promise<
    Array<{ startAt: string; endAt: string; items: Array<{ ref: string }> }>
  > {
    // Strategy: prefer schedules endpoints only
    // 1) /schedules/by-version/?latest=1 (then /schedules/latest/slots/ if needed for expansion)
    // 2) Fallback to /slots/ (expanded)

    const aggregate = (
      records: Array<{
        start?: string;
        end?: string;
        submission?: { speakers?: Array<PretalxSpeaker> };
      }>
    ) => {
      const slotsOut: Array<{
        startAt: string;
        endAt: string;
        items: Array<{ ref: string }>;
      }> = [];
      let skippedNoTime = 0;
      let skippedNoSubmission = 0;
      for (const rec of records) {
        if (!rec.start || !rec.end) {
          skippedNoTime++;
          continue;
        }
        const noteSet = new Set<string>();
        const speakers = rec.submission?.speakers || [];
        if (!rec.submission) {
          skippedNoSubmission++;
        }
        for (const sp of speakers) {
          const note = this.extractNoteFromSpeaker(sp);
          if (note) noteSet.add(note);
        }
        slotsOut.push({
          startAt: rec.start,
          endAt: rec.end,
          items: Array.from(noteSet).map(ref => ({ ref }))
        });
      }
      return { slotsOut, skippedNoTime, skippedNoSubmission };
    };

    // Attempt 1: schedules (by-version latest → expanded latest slots if needed)
    let base: PretalxExpandedSlot[] = [];
    try {
      const latest = await this.fetchScheduleLatestSlots();
      base = latest as unknown as PretalxExpandedSlot[];
    } catch (e) {
      this.logger.warn(
        `Schedules by-version fetch failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    if (base.length > 0) {
      const { slotsOut, skippedNoTime, skippedNoSubmission } = aggregate(base);
      this.logger.info(
        `Processed slots (slots endpoints): ${slotsOut.length} valid, ${skippedNoTime} missing times, ${skippedNoSubmission} missing submissions`
      );
      slotsOut.sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      );
      if (slotsOut.length > 0) return slotsOut;
    }

    // Attempt 2: /slots/ (expanded) — only if schedules produced nothing usable
    this.logger.warn(
      'No usable slots from schedules. Falling back to /slots/ endpoint.'
    );
    const expandedSlots = await this.fetchExpandedSlots();
    const {
      slotsOut: slotsFromSlots,
      skippedNoTime: sNoTime,
      skippedNoSubmission: sNoSub
    } = aggregate(expandedSlots);
    this.logger.info(
      `Processed /slots/ fallback: ${slotsFromSlots.length} valid, ${sNoTime} missing times, ${sNoSub} missing submissions`
    );
    slotsFromSlots.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
    return slotsFromSlots;
  }

  public async buildSlotsFromVersion(
    version: string
  ): Promise<
    Array<{ startAt: string; endAt: string; items: Array<{ ref: string }> }>
  > {
    // Prefer schedule expanded endpoint when using shortcuts like 'latest' or 'wip'
    let records: PretalxScheduleSlot[] = [];
    if (version === 'latest' || version === 'wip') {
      try {
        const schedule = await this.fetchScheduleExpanded(version);
        records = (schedule.slots || []) as PretalxScheduleSlot[];
      } catch (e) {
        this.logger.warn(
          `Expanded schedule fetch failed for ${version}, falling back to slots list filter: ${e instanceof Error ? e.message : String(e)}`
        );
        records = await this.fetchSlotsByVersion(version);
      }
    } else {
      records = await this.fetchSlotsByVersion(version);
    }
    const slotsOut: Array<{
      startAt: string;
      endAt: string;
      items: Array<{ ref: string }>;
    }> = [];
    let skippedNoTime = 0;
    for (const rec of records) {
      if (!rec.start || !rec.end) {
        skippedNoTime++;
        continue;
      }
      const noteSet = new Set<string>();
      const speakers = rec.submission?.speakers || [];
      for (const sp of speakers) {
        const note = this.extractNoteFromSpeaker(sp);
        if (note) noteSet.add(note);
      }
      slotsOut.push({
        startAt: rec.start,
        endAt: rec.end,
        items: Array.from(noteSet).map(ref => ({ ref }))
      });
    }
    this.logger.info(
      `Version ${version} processed: ${slotsOut.length} valid, ${skippedNoTime} missing times`
    );
    slotsOut.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
    return slotsOut;
  }

  private async fetchAnswersForQuestion(
    questionId: number
  ): Promise<Map<string, string>> {
    // Fetch all answers with question expanded, then filter by question ID
    // Note: person field is typically just a string code, not an object
    const path = `/api/events/${this.eventSlug}/answers/?expand=question`;
    this.logger.info(`Fetching answers for question ${questionId} from: ${path}`);
    try {
      const answers = await this.paginate<{
        person?: string | { code?: string } | number;
        answer?: string;
        question?: number | { id?: number };
      }>(path);
      
      this.logger.info(`Fetched ${answers.length} total answers from API`);
      
      const speakerAnswerMap = new Map<string, string>();
      let matchedQuestions = 0;
      let validSpeakerCodes = 0;
      let validAnswers = 0;
      
      for (const answer of answers) {
        // Check if this answer is for the target question
        let isTargetQuestion = false;
        if (typeof answer.question === 'number') {
          isTargetQuestion = answer.question === questionId;
        } else if (answer.question && typeof answer.question === 'object') {
          isTargetQuestion = answer.question.id === questionId;
        }
        
        if (!isTargetQuestion) continue;
        matchedQuestions++;
        
        // Extract speaker code from person field (usually just a string code like "T8J8BP")
        let speakerCode: string | null = null;
        if (typeof answer.person === 'string') {
          speakerCode = answer.person;
        } else if (typeof answer.person === 'number') {
          // If person is just an ID, we can't use it (we need code)
          this.logger.debug(`Answer has person as number ID, skipping: ${answer.person}`);
          continue;
        } else if (answer.person && typeof answer.person === 'object') {
          speakerCode = answer.person.code || null;
        }
        
        if (!speakerCode) {
          this.logger.debug(`Answer missing speaker code, person field: ${JSON.stringify(answer.person)}`);
          continue;
        }
        validSpeakerCodes++;
        
        // Extract answer value (note1 or nevent1)
        const answerValue = answer.answer;
        if (!answerValue || typeof answerValue !== 'string') {
          this.logger.debug(`Answer missing or invalid answer value for speaker ${speakerCode}`);
          continue;
        }
        
        const trimmedValue = answerValue.trim();
        if (trimmedValue.startsWith('note1') || trimmedValue.startsWith('nevent1')) {
          speakerAnswerMap.set(speakerCode, trimmedValue);
          validAnswers++;
          this.logger.debug(`Mapped speaker ${speakerCode} -> ${trimmedValue}`);
        } else {
          this.logger.debug(`Answer for speaker ${speakerCode} doesn't start with note1/nevent1: ${trimmedValue.substring(0, 50)}`);
        }
      }
      
      this.logger.info(
        `Answer processing: ${matchedQuestions} matched question ${questionId}, ${validSpeakerCodes} had valid speaker codes, ${validAnswers} valid note/nevent answers. Map size: ${speakerAnswerMap.size}`
      );
      
      // Log first few mappings for debugging
      if (speakerAnswerMap.size > 0) {
        const sampleEntries = Array.from(speakerAnswerMap.entries()).slice(0, 5);
        this.logger.info(`Sample speaker->answer mappings: ${JSON.stringify(sampleEntries)}`);
      }
      
      return speakerAnswerMap;
    } catch (error) {
      this.logger.error(
        `Failed to fetch answers for question ${questionId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return new Map();
    }
  }

  public async buildPreview(
    version: string,
    roomId?: number | string
  ): Promise<
    Array<{
      startAt: string;
      endAt: string;
      items: Array<{ ref: string }>;
      room?: { id?: number | string; name?: string };
      title?: string;
      speakers?: string[];
      code?: string;
    }>
  > {
    let records: PretalxScheduleSlot[] = [];
    if (version === 'latest' || version === 'wip') {
      try {
        const schedule = await this.fetchScheduleExpanded(version);
        records = (schedule.slots || []) as PretalxScheduleSlot[];
        this.logger.info(
          `Fetched ${records.length} slots from expanded schedule ${version}`
        );
      } catch (e) {
        this.logger.warn(
          `Expanded schedule fetch failed for ${version}, falling back to slots filter: ${e instanceof Error ? e.message : String(e)}`
        );
        records = await this.fetchSlotsByVersion(version);
      }
    } else {
      records = await this.fetchSlotsByVersion(version);
    }

    // Fetch answers for question 6269 (Note or Event ID)
    const speakerAnswerMap = await this.fetchAnswersForQuestion(6269);

    const out: Array<{
      startAt: string;
      endAt: string;
      items: Array<{ ref: string }>;
      room?: { id?: number | string; name?: string };
      title?: string;
      speakers?: string[];
      code?: string;
    }> = [];
    const roomMap = new Map<string, { id?: number | string; name?: string }>();
    let slotsWithRooms = 0;
    for (const rec of records) {
      if (!rec.start || !rec.end) continue;
      // Room might be expanded object {id, name} or just numeric ID
      let r: { id?: number | string; name?: string } | undefined;
      if (typeof rec.room === 'object' && rec.room !== null) {
        const roomObj = rec.room as { id?: number | string; name?: unknown };
        // Extract name - handle multi-language format or plain string
        let nameStr: string | undefined;
        if (typeof roomObj.name === 'string') {
          nameStr = roomObj.name;
        } else if (roomObj.name && typeof roomObj.name === 'object') {
          // Multi-language: try 'en' first, then first value
          const ml = roomObj.name as Record<string, unknown>;
          nameStr =
            (ml['en'] as string) ||
            (ml[Object.keys(ml)[0]] as string) ||
            String(roomObj.name);
        }
        r = { id: roomObj.id, name: nameStr };
      } else if (typeof rec.room === 'number' || typeof rec.room === 'string') {
        r = { id: rec.room };
      }
      if (r?.id != null) {
        slotsWithRooms++;
        const key = String(r.id);
        if (!roomMap.has(key)) roomMap.set(key, r);
      }
      if (roomId != null && r?.id != null && String(r.id) !== String(roomId))
        continue;
      const noteSet = new Set<string>();
      const speakers = rec.submission?.speakers || [];
      const speakerNames: string[] = [];
      let foundFromAnswers = 0;
      let foundFromHeuristic = 0;
      
      for (const sp of speakers) {
        // First try to get answer from question 6269 by speaker code
        const speakerCode = sp?.code;
        if (speakerCode) {
          if (speakerAnswerMap.has(speakerCode)) {
            const answer = speakerAnswerMap.get(speakerCode)!;
            noteSet.add(answer);
            foundFromAnswers++;
            this.logger.debug(`Slot speaker ${speakerCode} (${sp?.name}) found answer: ${answer}`);
          } else {
            // Fallback to heuristic extraction if no answer found for question 6269
            const note = this.extractNoteFromSpeaker(sp);
            if (note) {
              noteSet.add(note);
              foundFromHeuristic++;
              this.logger.debug(`Slot speaker ${speakerCode} (${sp?.name}) using heuristic: ${note}`);
            } else {
              this.logger.debug(`Slot speaker ${speakerCode} (${sp?.name}) has no note/nevent`);
            }
          }
        } else {
          this.logger.debug(`Slot speaker missing code: ${JSON.stringify(sp)}`);
        }
        if (sp?.name) speakerNames.push(sp.name);
      }
      
      if (speakers.length > 0 && noteSet.size === 0) {
        this.logger.warn(
          `Slot "${rec.submission?.title}" has ${speakers.length} speaker(s) but no notes found. Speaker codes: ${speakers.map(s => s?.code).filter(Boolean).join(', ')}`
        );
      }
      const title = (rec.submission?.title as string | undefined) || undefined;
      const code =
        (rec.submission as unknown as { code?: string } | undefined)?.code ||
        undefined;
      out.push({
        startAt: rec.start,
        endAt: rec.end,
        items: Array.from(noteSet).map(ref => ({ ref })),
        room: r,
        title,
        speakers: speakerNames,
        code
      });
    }
    this.logger.info(
      `Preview build complete: ${out.length} slots, ${slotsWithRooms} with rooms, ${roomMap.size} unique rooms`
    );
    return out.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
  }
}
