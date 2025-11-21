import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScheduleTimeline, Slot } from '../components/ScheduleTimeline';
import { StyleEditor, StyleConfig } from '../components/StyleEditor';

import { getApiBase } from '../utils/apiBase';

export const RoomAdminPage: React.FC = () => {
  const { roomId } = useParams<{ roomId?: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [rotationIntervalSec, setIntervalSec] = useState(60);
  const [rotationPolicy, setPolicy] = useState<
    'round_robin' | 'random' | 'weighted'
  >('round_robin');
  const [defaultItems, setDefaultItems] = useState('');
  const [scheduleJson, setScheduleJson] = useState<string>(`{
  "slots": [
    {
      "startAt": "${new Date(Date.now() + 5 * 60 * 1000).toISOString()}",
      "endAt": "${new Date(Date.now() + 35 * 60 * 1000).toISOString()}",
      "lives": [ { "ref": "nevent1qqsq5rk25y4th65h92qqkm825d9a943az3hs4cnajvl2mspvlyz2dss3npprf" }, { "ref": "nevent1qqspkmsxj6mq0s6n4xdephwscj7qh8py84e8q765r77aqez7srx57lqflrceu" } ]
    }
  ]
}`);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(
    roomId || null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);
  const [showIdCopied, setShowIdCopied] = useState(false);
  const [showUrlCopied, setShowUrlCopied] = useState(false);
  // Deprecated single-field import path retained for compatibility; not used in new UI
  // const [pretalxVersion] = useState<string>('');
  const [pretalxSchedules, setPretalxSchedules] = useState<
    Array<{ id?: string | number; version?: string; published?: string | null }>
  >([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [availableStages, setAvailableStages] = useState<
    Array<{ id?: string | number; name?: string | number }>
  >([]);
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const [pretalxRawResponse, setPretalxRawResponse] = useState<unknown | null>(
    null
  );
  const [loadedSlots, setLoadedSlots] = useState<
    Array<{
      startAt: string;
      endAt: string;
      items: Array<{ ref: string }>;
      title?: string;
      speakers?: string[];
    }>
  >([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [showPretalxModal, setShowPretalxModal] = useState(false);
  const [showPretalxDebug, setShowPretalxDebug] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showStyleModal, setShowStyleModal] = useState(false);
  const [roomStyleConfig, setRoomStyleConfig] = useState<StyleConfig | null>(null);
  const [currentEditingStyles, setCurrentEditingStyles] = useState<StyleConfig | null>(null);
  const styleEditorResetRef = React.useRef<(() => void) | null>(null);
  const [showAddSlotModal, setShowAddSlotModal] = useState(false);
  const [newSlotStart, setNewSlotStart] = useState('');
  const [newSlotEnd, setNewSlotEnd] = useState('');
  const [newSlotTitle, setNewSlotTitle] = useState('');
  const [newSlotSpeakers, setNewSlotSpeakers] = useState('');
  const [newSlotItems, setNewSlotItems] = useState<string[]>(['']);

  const fetchPretalxSchedules = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    setPretalxRawResponse(null);
    try {
      const res = await fetch(`${getApiBase()}/multi/pretalx/schedules`);
      const json = await res.json();
      setPretalxRawResponse(json); // Store raw response for debugging
      if (!res.ok || !json?.success)
        throw new Error(json?.error || 'Failed to fetch schedules');
      setPretalxSchedules(json.data?.schedules || []);
      if (!selectedVersion && (json.data?.schedules || []).length) {
        setSelectedVersion((json.data.schedules[0].version || '').toString());
      }
      setSuccess('Schedules loaded');
      setTimeout(() => setSuccess(null), 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }, [selectedVersion]);

  const loadVersionStages = useCallback(async () => {
    if (!selectedVersion) {
      setError('Select a schedule version first');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    setPretalxRawResponse(null);
    try {
      const params = new URLSearchParams({ version: selectedVersion });
      const res = await fetch(
        `${getApiBase()}/multi/pretalx/preview?${params.toString()}`
      );
      const json = await res.json();
      setPretalxRawResponse(json); // Store raw response for debugging
      if (!res.ok || !json?.success)
        throw new Error(json?.error || 'Failed to load preview');
      const slots = (json.data?.slots || []) as Array<{
        room?: { id?: string | number; name?: string };
      }>;
      const stageMap = new Map<
        string,
        { id?: string | number; name?: string | number }
      >();
      for (const s of slots) {
        const rid = s.room?.id;
        if (rid == null) continue;
        const key = String(rid);
        // Extract name - handle multi-language or plain string
        let name: string | number | undefined = s.room?.name;
        if (
          name &&
          typeof name !== 'string' &&
          typeof name !== 'number' &&
          typeof name === 'object'
        ) {
          const ml = name as Record<string, unknown>;
          name =
            (ml['en'] as string) ||
            (ml[Object.keys(ml)[0]] as string) ||
            String(rid);
        }
        if (!stageMap.has(key))
          stageMap.set(key, { id: rid, name: name || rid });
      }
      const stages = Array.from(stageMap.values());
      setAvailableStages(stages);
      if (!selectedStageId && stages.length)
        setSelectedStageId(String(stages[0].id ?? ''));
      setSuccess(`Found ${stages.length} stage(s)`);
      setTimeout(() => setSuccess(null), 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }, [selectedVersion, selectedStageId]);

  const loadStageToTimeline = useCallback(async () => {
    if (!selectedVersion) {
      setError('Select a schedule version first');
      return;
    }
    if (!selectedStageId) {
      setError('Select a stage first');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    setPretalxRawResponse(null);
    try {
      const params = new URLSearchParams({
        version: selectedVersion,
        roomId: selectedStageId
      });
      const res = await fetch(
        `${getApiBase()}/multi/pretalx/preview?${params.toString()}`
      );
      const json = await res.json();
      setPretalxRawResponse(json); // Store raw response for debugging
      if (!res.ok || !json?.success)
        throw new Error(json?.error || 'Failed to load stage slots');
      const slots = (json.data?.slots || []) as Array<{
        startAt: string;
        endAt: string;
        items: Array<{ ref: string }>;
        title?: string;
        speakers?: string[];
      }>;

      // Extract unique dates from slots using original timezone (extract date part directly from ISO string)
      const dateSet = new Set<string>();
      slots.forEach(slot => {
        // Extract date part (YYYY-MM-DD) directly from ISO string to preserve original timezone
        // Format: "2024-01-15T10:00:00+00:00" -> "2024-01-15"
        const date = slot.startAt.split('T')[0];
        dateSet.add(date);
      });
      const dates = Array.from(dateSet).sort();
      setAvailableDates(dates);
      setLoadedSlots(slots);
      setSelectedDate('all'); // Reset to "all" when loading a new stage

      // Don't automatically update timeline - user must click "Apply to Timeline" button
      setSuccess(
        `Loaded ${slots.length} slot${slots.length !== 1 ? 's' : ''} from stage. Select a date filter and click "Apply to Timeline" to load.`
      );
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }, [selectedVersion, selectedStageId]);

  const updateSlotsFromTimeline = useCallback((newSlots: Slot[]) => {
    try {
      const newSchedule = { slots: newSlots };
      setScheduleJson(JSON.stringify(newSchedule, null, 2));
    } catch {
      // ignore
    }
  }, []);

  // Apply filtered slots to timeline
  const applyDateFilter = useCallback(() => {
    if (loadedSlots.length === 0) {
      setError('No slots loaded. Please load a stage first.');
      return;
    }

    let filteredSlots = loadedSlots;
    if (selectedDate !== 'all') {
      filteredSlots = loadedSlots.filter(slot => {
        // Extract date part directly from ISO string to preserve original timezone
        const slotDate = slot.startAt.split('T')[0];
        return slotDate === selectedDate;
      });
    }

    const timelineSlots: Slot[] = filteredSlots.map(s => ({
      startAt: s.startAt,
      endAt: s.endAt,
      lives: s.items.map(item => ({ ref: item.ref })),
      title: s.title,
      speakers: s.speakers
    }));
    updateSlotsFromTimeline(timelineSlots);
    if (selectedDate !== 'all') {
      const dateObj = new Date(selectedDate);
      const formattedDate = dateObj.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      setSuccess(
        `Applied ${timelineSlots.length} slot${timelineSlots.length !== 1 ? 's' : ''} from ${formattedDate} to timeline`
      );
    } else {
      setSuccess(
        `Applied ${timelineSlots.length} slot${timelineSlots.length !== 1 ? 's' : ''} to timeline`
      );
    }
    setTimeout(() => setSuccess(null), 2000);
  }, [loadedSlots, selectedDate, updateSlotsFromTimeline]);

  // Reset date filter when stage changes
  useEffect(() => {
    setSelectedDate('all');
    setLoadedSlots([]);
    setAvailableDates([]);
  }, [selectedStageId]);

  // Removed unused importFromPretalx handler in favor of version/stage workflow

  // Parse slots from JSON and sync
  const parsedSlots = useMemo<Slot[]>(() => {
    try {
      const parsed = JSON.parse(scheduleJson);
      const slots = parsed.slots || [];
      // Normalize slots: ensure they have 'lives' (convert from 'items' if needed, or default to empty array)
      return slots.map(
        (slot: Partial<Slot> & { items?: Array<{ ref: string }> }) => ({
          ...slot,
          lives: slot.lives || slot.items || []
        })
      );
    } catch {
      return [];
    }
  }, [scheduleJson]);

  // Close settings modal on successful save/create
  useEffect(() => {
    if (success && showSettingsModal) {
      const timer = setTimeout(() => setShowSettingsModal(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [success, showSettingsModal]);

  // Auto-fetch Pretalx schedules when modal opens
  useEffect(() => {
    if (showPretalxModal) {
      fetchPretalxSchedules();
    }
  }, [showPretalxModal, fetchPretalxSchedules]);

  // Load room details when navigating after creation
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    (async () => {
      try {
        // Check if we have a stored password for this room
        const storedPassword = sessionStorage.getItem(
          `room_${roomId}_password`
        );
        let res;

        if (storedPassword) {
          // Use POST with password if we have one stored
          res = await fetch(`${getApiBase()}/multi/${roomId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: storedPassword })
          });
        } else {
          // Use GET if no password
          res = await fetch(`${getApiBase()}/multi/${roomId}`);
        }

        if (cancelled) return;
        if (res.status === 404) {
          navigate('/live/multi', { replace: true });
          return;
        }
        if (res.status === 401) {
          // Password invalid or expired - clear and redirect to login
          sessionStorage.removeItem(`room_${roomId}_password`);
          navigate('/live/multi', { replace: true });
          return;
        }
        if (!res.ok) throw new Error('Failed to load room');
        const json = await res.json();
        if (json?.success && json?.data?.config) {
          const cfg = json.data.config as {
            id: string;
            name: string;
            rotationPolicy: 'round_robin' | 'random' | 'weighted';
            rotationIntervalSec: number;
            defaultItems: string[];
            styleConfig?: StyleConfig;
          };
          setCreatedRoomId(cfg.id);
          setName(cfg.name || '');
          setPolicy(cfg.rotationPolicy);
          setIntervalSec(cfg.rotationIntervalSec || 60);
          setDefaultItems((cfg.defaultItems || []).join('\n'));
          setRoomStyleConfig(cfg.styleConfig || null);
          // Preload schedule JSON if present
          if (json.data.schedule) {
            setScheduleJson(JSON.stringify(json.data.schedule, null, 2));
          }
        } else {
          throw new Error('Invalid room response');
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, navigate]);

  const createRoom = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: name || 'Untitled Room'
      };
      const res = await fetch(`${getApiBase()}/multi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to create room');
      setCreatedRoomId(json.data.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }, [name]);

  const validateSchedule = useCallback(
    (jsonText: string): { valid: boolean; error?: string } => {
      try {
        const schedule = JSON.parse(jsonText);
        if (!Array.isArray(schedule.slots))
          return { valid: false, error: 'schedule.slots must be an array' };
        for (const slot of schedule.slots) {
          if (!slot.startAt || !slot.endAt)
            return {
              valid: false,
              error: 'Each slot must have startAt and endAt (UTC ISO)'
            };
          // Support both 'lives' (new format) and 'items' (legacy format)
          const lives = slot.lives || slot.items;
          if (!Array.isArray(lives))
            return { valid: false, error: 'Each slot.lives must be an array' };
          for (const live of lives) {
            if (
              !live.ref ||
              (!live.ref.startsWith('note1') && !live.ref.startsWith('nevent1'))
            ) {
              return {
                valid: false,
                error:
                  'Each live must have a valid ref (note1... or nevent1...)'
              };
            }
          }
          const start = new Date(slot.startAt);
          const end = new Date(slot.endAt);
          if (isNaN(start.getTime()) || isNaN(end.getTime()))
            return { valid: false, error: 'Invalid date format (use ISO UTC)' };
          if (end <= start)
            return { valid: false, error: 'endAt must be after startAt' };
        }
        return { valid: true };
      } catch (e) {
        return {
          valid: false,
          error: e instanceof Error ? e.message : 'Invalid JSON'
        };
      }
    },
    []
  );

  const uploadSchedule = useCallback(async () => {
    if (!createdRoomId) {
      setScheduleError('Create a room first');
      return;
    }
    const validation = validateSchedule(scheduleJson);
    if (!validation.valid) {
      setScheduleError(validation.error || 'Invalid schedule');
      return;
    }
    setBusy(true);
    setScheduleError(null);
    setScheduleSuccess(null);
    try {
      const schedule = JSON.parse(scheduleJson);
      // Normalize schedule: ensure all slots have 'lives' (convert from 'items' if needed)
      const normalizedSchedule = {
        slots: (schedule.slots || []).map(
          (slot: Partial<Slot> & { items?: Array<{ ref: string }> }) => ({
            ...slot,
            lives: slot.lives || slot.items || []
          })
        )
      };
      const res = await fetch(
        `${getApiBase()}/multi/${createdRoomId}/schedule`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalizedSchedule)
        }
      );
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error || 'Failed to set schedule');
      setScheduleSuccess('Schedule uploaded successfully!');
      setTimeout(() => setScheduleSuccess(null), 3000);
    } catch (e: unknown) {
      setScheduleError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }, [createdRoomId, scheduleJson, validateSchedule]);

  const saveSettings = useCallback(async () => {
    if (!createdRoomId) {
      setError('Create a room first');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        name: name || 'Untitled Room',
        rotationPolicy,
        rotationIntervalSec,
        defaultItems: defaultItems
          .split(/\n|,/)
          .map(s => s.trim())
          .filter(Boolean)
      };
      const res = await fetch(`${getApiBase()}/multi/${createdRoomId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error || 'Failed to save settings');
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }, [createdRoomId, name, rotationPolicy, rotationIntervalSec, defaultItems]);

  const copyRoomId = useCallback(() => {
    if (!createdRoomId) return;
    navigator.clipboard.writeText(createdRoomId);
    setShowIdCopied(true);
    setTimeout(() => setShowIdCopied(false), 2000);
  }, [createdRoomId]);

  const copyViewerUrl = useCallback(() => {
    if (!createdRoomId) return;
    const url = `${window.location.origin}/live/multi/${createdRoomId}`;
    navigator.clipboard.writeText(url);
    setShowUrlCopied(true);
    setTimeout(() => setShowUrlCopied(false), 2000);
  }, [createdRoomId]);

  const exportSchedule = useCallback(() => {
    const blob = new Blob([scheduleJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule-${createdRoomId || 'new'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setScheduleSuccess('Schedule exported!');
    setTimeout(() => setScheduleSuccess(null), 2000);
  }, [scheduleJson, createdRoomId]);

  const importSchedule = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = event => {
        try {
          const text = event.target?.result as string;
          const parsed = JSON.parse(text);
          setScheduleJson(JSON.stringify(parsed, null, 2));
          setScheduleSuccess('Schedule imported!');
          setTimeout(() => setScheduleSuccess(null), 2000);
        } catch {
          setScheduleError('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    },
    []
  );

  const loadProvidedSchedule = useCallback(() => {
    const templateSlots = [
      {
        startAt: '2025-11-14T09:00:00Z',
        endAt: '2025-11-14T09:30:00Z',
        lives: [
          {
            ref: 'note16a7m73en9w4artfclcnhqf8jzngepmg2j2et3l2yk0ksfhftv0ls3hugv7'
          }
        ]
      },
      {
        startAt: '2025-11-14T09:30:00Z',
        endAt: '2025-11-14T10:00:00Z',
        lives: [
          {
            ref: 'note1j8fpjg60gkw266lz86ywmyr2mmy5e6kfkhtfu4umaxneff6qeyhqrl37gu'
          }
        ]
      },
      {
        startAt: '2025-11-14T10:00:00Z',
        endAt: '2025-11-14T10:30:00Z',
        lives: [
          {
            ref: 'note1lsreglfs5s5zm6e8ssavaak2adsajkad27axp00rvz734u443znqspwhvv'
          }
        ]
      },
      {
        startAt: '2025-11-14T10:30:00Z',
        endAt: '2025-11-14T11:00:00Z',
        lives: [
          {
            ref: 'nevent1qqsphk43g2pzpwfr8qcp5zdx8ftgaj7gvxk682y4sedjvscrsm0lpssc96mm3'
          }
        ]
      },
      {
        startAt: '2025-11-14T11:00:00Z',
        endAt: '2025-11-14T11:30:00Z',
        lives: [
          {
            ref: 'nevent1qvzqqqqqqypzqlea4mfml7qvctjsypywae5g5ra8zj6t3f8sqcuj53h9xq9nn6pjqqsffzd548j3gtkck0hemn9jqgqfpdttatwhpg3vd3plhghlhatzw6cpmvz4r'
          },
          {
            ref: 'nevent1qvzqqqqqqypzqpxfzhdwlm3cx9l6wdzyft8w8y9gy607tqgtyfq7tekaxs7lhmxfqqsygu0jcvwfp7p3hhe42stxu44dcuz5zt9cy052qfg2ea98gxy2sfq2wh7j0'
          },
          {
            ref: 'nevent1qvzqqqqqqypzqy9kvcxtqa2tlwyjv4r46ancxk00ghk9yaudzsnp697s60942p7lqqs0sqpv028v3xy6z27qx8sfukgl5wn2z7j4u8ylrs8w5gfmp44j0rc4avhey'
          }
        ]
      },
      {
        startAt: '2025-11-14T11:30:00Z',
        endAt: '2025-11-14T12:00:00Z',
        lives: [
          {
            ref: 'nevent1qvzqqqqqqypzpw9fm7ppszzwfyxc3q6z482g3d70p7eqkxseh93mantga44ttjaaqy2hwumn8ghj7un9d3shjtnyv9kh2uewd9hj7qghdehhxarj945kgc369uhkxctrdpjj6un9d3shjqpq04k2daej76pv0nfrefuwp0xm4gjmqqwx0vc6yhsq9jkr956879ds4tsslp'
          }
        ]
      },
      {
        startAt: '2025-11-14T12:00:00Z',
        endAt: '2025-11-14T12:30:00Z',
        lives: [
          {
            ref: 'nevent1qqsdz8sqytjeum0utxvkvknyp9a7t0twv976tuuyzf3ngwc3572tltct2ek8j'
          }
        ]
      },
      {
        startAt: '2025-11-14T12:30:00Z',
        endAt: '2025-11-14T13:00:00Z',
        lives: [
          {
            ref: 'nevent1qqs0sqpv028v3xy6z27qx8sfukgl5wn2z7j4u8ylrs8w5gfmp44j0rceyfxj5'
          }
        ]
      },
      {
        startAt: '2025-11-14T14:00:00Z',
        endAt: '2025-11-14T14:30:00Z',
        lives: [
          {
            ref: 'nevent1qqs8t9m7rcgnjj35ekvcrgpxt78t0u9a7yyp5pkjmmkae4kg7d8s5sqd7u960'
          }
        ]
      },
      {
        startAt: '2025-11-14T14:30:00Z',
        endAt: '2025-11-14T15:00:00Z',
        lives: [
          {
            ref: 'nevent1qqsre8grh4vyyhlsnp7wy5r8xrvsffzeg7w4tz5mr0t6fhd6x77fexcrl34gy'
          }
        ]
      },
      {
        startAt: '2025-11-14T15:00:00Z',
        endAt: '2025-11-14T15:30:00Z',
        lives: [
          {
            ref: 'nevent1qqsv4jk2xzhkfh6kk3uwfwf2xjvpl4qsne435njml08kr7pnhpcfhxq8k43rt'
          }
        ]
      },
      {
        startAt: '2025-11-14T15:30:00Z',
        endAt: '2025-11-14T16:00:00Z',
        lives: [
          {
            ref: 'nevent1qqsf6r5v9n6kj6mhjruylugz55gac44tzfyyh884rdvfasls0yujgqsl9vkqe'
          }
        ]
      },
      {
        startAt: '2025-11-14T16:00:00Z',
        endAt: '2025-11-14T16:30:00Z',
        lives: [
          {
            ref: 'nevent1qqsxnzdah0x9sp75ajrzve4aehacqt9rzepjcfkrfrllr65h6v542ksrhyy82'
          }
        ]
      },
      {
        startAt: '2025-11-14T16:30:00Z',
        endAt: '2025-11-14T17:00:00Z',
        lives: [
          {
            ref: 'nevent1qqsrc4h3a7063fxn2lwt5ven9dyv949k9yeh3rju0z2p7t2shmp0zfc44nm74'
          }
        ]
      },
      {
        startAt: '2025-11-14T17:00:00Z',
        endAt: '2025-11-14T17:30:00Z',
        lives: [
          {
            ref: 'nevent1qqs90rz4e4prc909h6f9cn30872h9rk4etqfqw3xrrgpd7waennjg2s9mc0jn'
          }
        ]
      },
      {
        startAt: '2025-11-14T17:30:00Z',
        endAt: '2025-11-14T18:00:00Z',
        lives: []
      }
    ];
    const newSchedule = { slots: templateSlots };
    setScheduleJson(JSON.stringify(newSchedule, null, 2));
    setScheduleSuccess('Template schedule loaded!');
    setTimeout(() => setScheduleSuccess(null), 2000);
  }, []);

  const insertCurrentTime = useCallback((isStart: boolean) => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const localISO = local.toISOString().slice(0, 16);
    if (isStart) setNewSlotStart(localISO);
    else setNewSlotEnd(localISO);
  }, []);

  const addItemToSlot = useCallback(() => {
    setNewSlotItems([...newSlotItems, '']);
  }, [newSlotItems]);

  const removeItemFromSlot = useCallback(
    (index: number) => {
      if (newSlotItems.length > 1) {
        setNewSlotItems(newSlotItems.filter((_, i) => i !== index));
      }
    },
    [newSlotItems]
  );

  const addSlot = useCallback(() => {
    if (!newSlotStart || !newSlotEnd) {
      setScheduleError('Please provide both start and end times');
      return;
    }
    const start = new Date(newSlotStart);
    const end = new Date(newSlotEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      setScheduleError('Invalid dates: end must be after start');
      return;
    }

    // Filter out empty lives and validate refs
    const lives = newSlotItems
      .filter(item => item.trim())
      .map(item => ({ ref: item.trim() }));

    if (lives.length === 0) {
      setScheduleError('Please add at least one live (note1... or nevent1...)');
      return;
    }

    const newSlot: Slot = {
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      lives,
      ...(newSlotTitle.trim() && { title: newSlotTitle.trim() }),
      ...(newSlotSpeakers.trim() && {
        speakers: newSlotSpeakers
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      })
    };
    const updatedSlots = [...parsedSlots, newSlot].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
    updateSlotsFromTimeline(updatedSlots);

    // Reset all fields
    setNewSlotStart('');
    setNewSlotEnd('');
    setNewSlotTitle('');
    setNewSlotSpeakers('');
    setNewSlotItems(['']);
    setShowAddSlotModal(false);
    setScheduleError(null);
    setScheduleSuccess('Slot added successfully!');
    setTimeout(() => setScheduleSuccess(null), 2000);
  }, [
    newSlotStart,
    newSlotEnd,
    newSlotTitle,
    newSlotSpeakers,
    newSlotItems,
    parsedSlots,
    updateSlotsFromTimeline
  ]);

  return (
    <div
      style={{
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        height: '100vh',
        background: '#ffffff',
        overflow: 'hidden'
      }}
    >
      <div
        style={{ background: '#ffffff', border: 'none', padding: '0 16 0 16' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>
              {createdRoomId ? name || 'Untitled Room' : 'Room Admin'}
            </h2>
            {createdRoomId && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  padding: '6px 8px'
                }}
              >
                <span
                  style={{ fontSize: 10, color: '#4b5563', marginRight: 4 }}
                >
                  ID:
                </span>
                <span
                  style={{
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontSize: 10,
                    color: '#374151'
                  }}
                >
                  {createdRoomId}
                </span>
                <button
                  onClick={copyRoomId}
                  aria-label="Copy ID"
                  title="Copy ID"
                  style={{
                    width: 18,
                    height: 18,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 10,
                    transition: 'all 0.2s'
                  }}
                >
                  {showIdCopied ? '✓' : '📋'}
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {createdRoomId ? (
              <>
                <button
                  onClick={copyViewerUrl}
                  aria-label="Copy Viewer URL"
                  title="Copy Viewer URL"
                  style={{
                    width: 28,
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 14,
                    transition: 'all 0.2s',
                    color: showUrlCopied ? '#10b981' : 'inherit'
                  }}
                >
                  {showUrlCopied ? '✓' : '🔗'}
                </button>
                <button
                  onClick={() =>
                    window.open(`/live/multi/${createdRoomId}`, '_blank')
                  }
                  aria-label="Open Viewer"
                  title="Open Viewer"
                  style={{
                    width: 28,
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 14
                  }}
                >
                  ↗
                </button>
                <button
                  onClick={() => {
                    setCurrentEditingStyles(roomStyleConfig);
                    setShowStyleModal(true);
                  }}
                  aria-label="Style Settings"
                  title="Style Settings"
                  style={{
                    width: 28,
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 14
                  }}
                >
                  🎨
                </button>
                <button
                  onClick={() => window.open(`/live/multi/${createdRoomId}/stats`, '_blank')}
                  aria-label="Statistics"
                  title="Statistics"
                  style={{
                    width: 28,
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 14
                  }}
                >
                  📊
                </button>
                <button
                  onClick={() => setShowSettingsModal(true)}
                  aria-label="Settings"
                  title="Settings"
                  style={{
                    width: 28,
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#4a75ff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 14
                  }}
                >
                  ⚙️
                </button>
                <img
                  src="/live/images/powered_by_white_bg.png"
                  alt="Powered by PubPay"
                  style={{ height: '3.5vw', marginLeft: 8 }}
                />
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowSettingsModal(true)}
                  style={{
                    background: '#4a75ff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '8px 14px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Create Room
                </button>
                <img
                  src="/live/images/powered_by_white_bg.png"
                  alt="Powered by PubPay"
                  style={{ height: '4vw', marginLeft: 8 }}
                />
              </>
            )}
          </div>
        </div>
        {!showPretalxModal && !showSettingsModal && error && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: '#FEF2F2',
              color: '#B91C1C',
              border: '1px solid #FECACA',
              borderRadius: 8
            }}
          >
            {error}
          </div>
        )}
        {!showPretalxModal && !showSettingsModal && success && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: '#ECFDF5',
              color: '#065F46',
              border: '1px solid #A7F3D0',
              borderRadius: 8
            }}
          >
            {success}
          </div>
        )}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <ScheduleTimeline
          slots={parsedSlots}
          onChange={updateSlotsFromTimeline}
          onAddSlotAtTime={startTime => {
            setNewSlotStart(startTime);
            setNewSlotEnd(startTime); // Pre-fill end time with same value
            setShowAddSlotModal(true);
          }}
          scheduleJson={scheduleJson}
          onUpdateJson={setScheduleJson}
          onOpenAddSlotModal={() => setShowAddSlotModal(true)}
          onUploadSchedule={uploadSchedule}
          onExportSchedule={exportSchedule}
          onImportSchedule={importSchedule}
          onLoadProvidedSchedule={loadProvidedSchedule}
          onOpenPretalxModal={() => setShowPretalxModal(true)}
          createdRoomId={createdRoomId}
          busy={busy}
          scheduleError={scheduleError}
          scheduleSuccess={scheduleSuccess}
        />
      </div>

      {/* Pretalx Modal */}
      {showPretalxModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            style={{
              width: 'min(920px, 94vw)',
              background: '#ffffff',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              boxShadow: '0 10px 32px rgba(0,0,0,0.2)',
              padding: 16
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12
              }}
            >
              <h3 style={{ margin: 0 }}>Sync with Pretalx</h3>
              <button
                onClick={() => setShowPretalxModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 18
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr auto',
                  gap: 8,
                  alignItems: 'center'
                }}
              >
                <select
                  value={selectedVersion}
                  onChange={e => setSelectedVersion(e.target.value)}
                >
                  <option value="">Select version</option>
                  <option value="wip">wip (work in progress)</option>
                  <option value="latest">latest (published)</option>
                  {pretalxSchedules.map((s, i) => (
                    <option
                      key={`${s.version || s.id || i}`}
                      value={(s.version || '').toString()}
                    >
                      {(s.version || '').toString()}{' '}
                      {s.published ? '(published)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={loadVersionStages}
                  disabled={busy || !selectedVersion}
                  style={{
                    background: '#f3f4f6',
                    color: '#111827',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Load version
                </button>
                <select
                  value={selectedStageId}
                  onChange={e => setSelectedStageId(e.target.value)}
                >
                  <option value="">Select stage</option>
                  {availableStages.map((r, i) => (
                    <option key={`${r.id || i}`} value={String(r.id ?? '')}>
                      {String(r.name ?? r.id ?? '')}
                    </option>
                  ))}
                </select>
                <button
                  onClick={loadStageToTimeline}
                  disabled={busy || !selectedStageId}
                  style={{
                    background: '#4a75ff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: busy ? 0.7 : 1
                  }}
                >
                  Load stage
                </button>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 8,
                  alignItems: 'center'
                }}
              >
                <label style={{ fontWeight: 600, color: '#111827' }}>
                  Filter by date:
                </label>
                {availableDates.length > 0 ? (
                  <select
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    style={{
                      borderRadius: 8,
                      padding: '6px 10px',
                      border: '1px solid #e5e7eb'
                    }}
                  >
                    <option value="all">All days</option>
                    {availableDates.map(date => {
                      const dateObj = new Date(date);
                      const formattedDate = dateObj.toLocaleDateString(
                        'en-US',
                        {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }
                      );
                      return (
                        <option key={date} value={date}>
                          {formattedDate}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <select
                    disabled
                    style={{
                      borderRadius: 8,
                      padding: '6px 10px',
                      border: '1px solid #e5e7eb',
                      background: '#f3f4f6',
                      color: '#6b7280'
                    }}
                  >
                    <option>No dates available</option>
                  </select>
                )}
                <button
                  onClick={applyDateFilter}
                  disabled={
                    busy ||
                    loadedSlots.length === 0 ||
                    availableDates.length === 0
                  }
                  style={{
                    background: '#4a75ff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity:
                      busy ||
                      loadedSlots.length === 0 ||
                      availableDates.length === 0
                        ? 0.7
                        : 1,
                    whiteSpace: 'nowrap'
                  }}
                >
                  Apply to Timeline
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setShowPretalxDebug(v => !v)}
                  style={{
                    background: '#F3F4F6',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {showPretalxDebug ? 'Hide details' : 'Show details'}
                </button>
                {(error || success) && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {error && (
                      <div
                        style={{
                          padding: '4px 8px',
                          background: '#FEF2F2',
                          color: '#B91C1C',
                          border: '1px solid #FECACA',
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '12px',
                          fontWeight: 500,
                          lineHeight: '1.2',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box',
                          margin: 0,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {error}
                      </div>
                    )}
                    {success && (
                      <div
                        style={{
                          padding: '4px 8px',
                          background: '#ECFDF5',
                          color: '#065F46',
                          border: '1px solid #A7F3D0',
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '12px',
                          fontWeight: 500,
                          lineHeight: '1.2',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box',
                          margin: 0,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {success}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {showPretalxDebug && (
                <div
                  style={{
                    marginTop: 8,
                    background: '#F9FAFB',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    fontSize: '0.85em',
                    height: '400px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                  }}
                >
                  <strong
                    style={{
                      padding: '12px 12px 8px 12px',
                      background: '#F9FAFB',
                      borderBottom: '1px solid #e5e7eb',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1
                    }}
                  >
                    Raw API Response:
                  </strong>
                  <div
                    style={{
                      flex: 1,
                      overflow: 'auto',
                      padding: '0 12px 12px 12px'
                    }}
                  >
                    {pretalxRawResponse !== null ? (
                      <pre
                        style={{
                          whiteSpace: 'pre-wrap',
                          marginTop: 4,
                          fontSize: '0.8em'
                        }}
                      >
                        {JSON.stringify(pretalxRawResponse, null, 2)}
                      </pre>
                    ) : (
                      <div
                        style={{
                          padding: '12px',
                          color: '#6b7280',
                          fontSize: '0.9em',
                          textAlign: 'center'
                        }}
                      >
                        {busy ? 'Loading...' : 'No data available'}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: 10
                }}
              >
                <button
                  onClick={() => setShowPretalxModal(false)}
                  style={{
                    background: '#f3f4f6',
                    color: '#111827',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            style={{
              width: 'min(600px, 94vw)',
              background: '#ffffff',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              boxShadow: '0 10px 32px rgba(0,0,0,0.2)',
              padding: 16,
              maxHeight: '90vh',
              overflow: 'auto'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12
              }}
            >
              <h3 style={{ margin: 0 }}>Room Settings</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 18
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {(error || success) && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {error && (
                    <div
                      style={{
                        padding: 8,
                        background: '#FEF2F2',
                        color: '#B91C1C',
                        border: '1px solid #FECACA',
                        borderRadius: 8
                      }}
                    >
                      {error}
                    </div>
                  )}
                  {success && (
                    <div
                      style={{
                        padding: 8,
                        background: '#ECFDF5',
                        color: '#065F46',
                        border: '1px solid #A7F3D0',
                        borderRadius: 8
                      }}
                    >
                      {success}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label
                  style={{ fontWeight: 600, fontSize: 13, color: '#374151' }}
                >
                  Name
                </label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Room name"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    marginTop: 6
                  }}
                />
              </div>
              <div>
                <label
                  style={{ fontWeight: 600, fontSize: 13, color: '#374151' }}
                >
                  Same slot rotation interval (sec)
                </label>
                <input
                  type="number"
                  value={rotationIntervalSec}
                  onChange={e =>
                    setIntervalSec(parseInt(e.target.value || '60', 10))
                  }
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    marginTop: 6
                  }}
                />
              </div>
              <div>
                <label
                  style={{ fontWeight: 600, fontSize: 13, color: '#374151' }}
                >
                  Default items (comma or newline separated)
                </label>
                <textarea
                  rows={5}
                  value={defaultItems}
                  onChange={e => setDefaultItems(e.target.value)}
                  placeholder={'note1...\nnevent1...'}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    marginTop: 6
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end',
                  marginTop: 8
                }}
              >
                <button
                  onClick={() => setShowSettingsModal(false)}
                  style={{
                    background: '#f3f4f6',
                    color: '#111827',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                {!createdRoomId ? (
                  <button
                    onClick={createRoom}
                    disabled={busy}
                    style={{
                      background: '#4a75ff',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '6px 12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      opacity: busy ? 0.7 : 1
                    }}
                  >
                    Create Room
                  </button>
                ) : (
                  <button
                    onClick={saveSettings}
                    disabled={busy}
                    style={{
                      background: '#4a75ff',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '6px 12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      opacity: busy ? 0.7 : 1
                    }}
                  >
                    Save Settings
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Style Settings Modal */}
      {showStyleModal && createdRoomId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowStyleModal(false);
            }
          }}
        >
          <div
            className="style-options-content"
            style={{
              border: '1px solid rgb(229, 231, 235)',
              width: 'min(600px, 94vw)',
              maxHeight: '90vh',
              borderRadius: 12,
              transform: 'none',
              borderLeft: 'none',
              boxShadow: '0 10px 32px rgba(0,0,0,0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="style-options-header">
              <h2>STYLE OPTIONS</h2>
              <button className="close-button" onClick={() => setShowStyleModal(false)}>
                &times;
              </button>
            </div>
            <div className="style-options-body">
              <StyleEditor
                initialStyles={roomStyleConfig || undefined}
                onSave={async (styles) => {
                  setBusy(true);
                  setError(null);
                  setSuccess(null);
                  try {
                    const res = await fetch(`${getApiBase()}/multi/${createdRoomId}/style`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(styles)
                    });
                    const json = await res.json();
                    if (!json.success) throw new Error(json.error || 'Failed to save styles');
                    setRoomStyleConfig(styles);
                    setSuccess('Styles saved successfully');
                    setTimeout(() => {
                      setShowStyleModal(false);
                      setSuccess(null);
                    }, 1500);
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : 'Error saving styles');
                  } finally {
                    setBusy(false);
                  }
                }}
                onCancel={() => setShowStyleModal(false)}
                renderButtons={false}
                onChange={(styles) => setCurrentEditingStyles(styles)}
                resetRef={styleEditorResetRef}
              />
            </div>
            {/* Action Buttons - Always Visible */}
            <div className="style-actions">
              <button
                onClick={() => {
                  // Call the reset function exposed by StyleEditor
                  if (styleEditorResetRef.current) {
                    styleEditorResetRef.current();
                  }
                }}
                className="action-btn secondary"
              >
                Reset
              </button>
              <button
                onClick={() => setShowStyleModal(false)}
                className="action-btn secondary"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const stylesToSave = currentEditingStyles || {};
                  setBusy(true);
                  setError(null);
                  setSuccess(null);
                  try {
                    const res = await fetch(`${getApiBase()}/multi/${createdRoomId}/style`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(stylesToSave)
                    });
                    const json = await res.json();
                    if (!json.success) throw new Error(json.error || 'Failed to save styles');
                    setRoomStyleConfig(stylesToSave);
                    setSuccess('Styles saved successfully');
                    setTimeout(() => {
                      setShowStyleModal(false);
                      setSuccess(null);
                    }, 1500);
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : 'Error saving styles');
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="action-btn primary"
                style={{
                  opacity: busy ? 0.7 : 1,
                  cursor: busy ? 'not-allowed' : 'pointer'
                }}
              >
                Save Styles
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Slot Modal */}
      {showAddSlotModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            style={{
              width: 'min(600px, 94vw)',
              background: '#ffffff',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              boxShadow: '0 10px 32px rgba(0,0,0,0.2)',
              padding: 16,
              maxHeight: '90vh',
              overflow: 'auto'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12
              }}
            >
              <h3 style={{ margin: 0 }}>Add Slot</h3>
              <button
                onClick={() => {
                  setShowAddSlotModal(false);
                  setNewSlotStart('');
                  setNewSlotEnd('');
                  setNewSlotTitle('');
                  setNewSlotSpeakers('');
                  setNewSlotItems(['']);
                  setError(null);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 18
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {error && (
                <div
                  style={{
                    padding: 8,
                    background: '#FEF2F2',
                    color: '#B91C1C',
                    border: '1px solid #FECACA',
                    borderRadius: 8
                  }}
                >
                  {error}
                </div>
              )}
              <div>
                <label
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    color: '#374151',
                    display: 'block',
                    marginBottom: 6
                  }}
                >
                  Start (local) *
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="datetime-local"
                    value={newSlotStart}
                    onChange={e => setNewSlotStart(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8
                    }}
                  />
                  <button
                    onClick={() => insertCurrentTime(true)}
                    style={{
                      padding: '8px 14px',
                      background: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: '0.85em'
                    }}
                  >
                    Now
                  </button>
                </div>
              </div>
              <div>
                <label
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    color: '#374151',
                    display: 'block',
                    marginBottom: 6
                  }}
                >
                  End (local) *
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="datetime-local"
                    value={newSlotEnd}
                    onChange={e => setNewSlotEnd(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8
                    }}
                  />
                  <button
                    onClick={() => insertCurrentTime(false)}
                    style={{
                      padding: '8px 14px',
                      background: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: '0.85em'
                    }}
                  >
                    Now
                  </button>
                </div>
              </div>
              <div>
                <label
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    color: '#374151',
                    display: 'block',
                    marginBottom: 6
                  }}
                >
                  Title
                </label>
                <input
                  type="text"
                  value={newSlotTitle}
                  onChange={e => setNewSlotTitle(e.target.value)}
                  placeholder="Optional slot title"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    color: '#374151',
                    display: 'block',
                    marginBottom: 6
                  }}
                >
                  Speakers
                </label>
                <input
                  type="text"
                  value={newSlotSpeakers}
                  onChange={e => setNewSlotSpeakers(e.target.value)}
                  placeholder="Comma-separated list of speakers"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    color: '#374151',
                    display: 'block',
                    marginBottom: 6
                  }}
                >
                  Lives (note1... or nevent1...) *
                </label>
                <div style={{ display: 'grid', gap: 6 }}>
                  {newSlotItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        value={item}
                        onChange={e => {
                          const updated = [...newSlotItems];
                          updated[idx] = e.target.value;
                          setNewSlotItems(updated);
                        }}
                        placeholder="note1... or nevent1..."
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          fontFamily: 'monospace',
                          fontSize: '12px'
                        }}
                      />
                      {newSlotItems.length > 1 && (
                        <button
                          onClick={() => removeItemFromSlot(idx)}
                          style={{
                            padding: '6px 12px',
                            background: '#f44336',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: '14px'
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={addItemToSlot}
                  style={{
                    marginTop: 6,
                    padding: '6px 12px',
                    background: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: '0.85em'
                  }}
                >
                  + Add Live
                </button>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end',
                  marginTop: 8
                }}
              >
                <button
                  onClick={() => {
                    setShowAddSlotModal(false);
                    setNewSlotStart('');
                    setNewSlotEnd('');
                    setNewSlotTitle('');
                    setNewSlotSpeakers('');
                    setNewSlotItems(['']);
                    setError(null);
                  }}
                  style={{
                    background: '#f3f4f6',
                    color: '#111827',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={addSlot}
                  disabled={
                    !newSlotStart ||
                    !newSlotEnd ||
                    newSlotItems.filter(i => i.trim()).length === 0
                  }
                  style={{
                    background: '#4a75ff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity:
                      !newSlotStart ||
                      !newSlotEnd ||
                      newSlotItems.filter(i => i.trim()).length === 0
                        ? 0.7
                        : 1
                  }}
                >
                  Add Slot
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
