import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { NostrClient, ensureZaps, ensureProfiles, getQueryClient, DEFAULT_READ_RELAYS, extractZapAmount, extractZapPayerPubkey, extractZapContent } from '@pubpay/shared-services';
import { Kind1Event, Kind9735Event, Kind0Event } from '@pubpay/shared-types';
import { getApiBase } from '../utils/apiBase';
import { sanitizeImageUrl } from '../utils/sanitization';

interface LiveRef {
  ref: string;
  weight?: number;
  title?: string;
}

interface Slot {
  startAt: string;
  endAt: string;
  lives: LiveRef[];
  title?: string;
  speakers?: string[];
}

interface Schedule {
  slots: Slot[];
}

interface RoomConfig {
  id: string;
  name: string;
  defaultItems: string[];
}

interface RoomState {
  config: RoomConfig;
  schedule: Schedule | null;
}

interface ZapDetail {
  zap: Kind9735Event;
  amount: number; // in millisats
  payerPubkey: string;
  profile: Kind0Event | null;
  message: string;
  timestamp: number;
}

interface NoteData {
  eventId: string;
  originalRef: string; // Store original ref for debugging
  note: Kind1Event | null;
  authorProfile: Kind0Event | null; // Author profile
  zaps: Kind9735Event[];
  zapDetails: ZapDetail[];
  zapAmount: number;
  zapCount: number;
  zappers: Map<string, { pubkey: string; amount: number; profile: Kind0Event | null }>;
}

interface ZapperStats {
  pubkey: string;
  totalAmount: number;
  zapCount: number;
  profile: Kind0Event | null;
}

interface LivePerformance {
  noteData: NoteData;
  rank: number;
  score: number; // Composite score for ranking
}

interface Stats {
  totalLives: number;
  totalNotes: number;
  totalZaps: number;
  totalZapAmount: number;
  uniqueZappers: number;
  notes: NoteData[];
  topZappers: ZapperStats[];
  topPerformingLives: LivePerformance[];
  dateRange: { earliest: number | null; latest: number | null };
}

export const MultiStatsPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const [roomData, setRoomData] = useState<RoomState | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [selectedLive, setSelectedLive] = useState<NoteData | null>(null);
  const [showLiveDetails, setShowLiveDetails] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string>('');
  const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [topLivesToShow, setTopLivesToShow] = useState<number>(10); // Start with top 10
  
  const nostrClientRef = useRef<NostrClient | null>(null);
  const subscriptionRefs = useRef<Array<{ unsubscribe: () => void }>>([]);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef<boolean>(false);
  const eventIdsRef = useRef<string[]>([]);

  // Initialize Nostr client
  useEffect(() => {
    if (!nostrClientRef.current) {
      nostrClientRef.current = new NostrClient(DEFAULT_READ_RELAYS);
    }
    return () => {
      // Cleanup on unmount
      if (nostrClientRef.current) {
        subscriptionRefs.current.forEach(sub => sub.unsubscribe());
        subscriptionRefs.current = [];
      }
    };
  }, []);

  // Parse note1/nevent1 reference to get event ID
  const parseLiveRef = useCallback((ref: string): string | null => {
    try {
      if (ref.startsWith('note1')) {
        const decoded = nip19.decode(ref);
        return decoded.data as string;
      } else if (ref.startsWith('nevent1')) {
        const decoded = nip19.decode(ref);
        const data = decoded.data as { id: string };
        return data.id;
      }
      // If it's already a hex ID, return as is
      if (/^[0-9a-f]{64}$/i.test(ref)) {
        return ref;
      }
      return null;
    } catch (err) {
      console.error('Failed to parse live ref:', ref, err);
      return null;
    }
  }, []);

  // Load room data
  const loadRoomData = useCallback(async () => {
    if (!roomId) return;
    
    try {
      const res = await fetch(`${getApiBase()}/multi/${roomId}`);
      if (!res.ok) throw new Error('Failed to load room data');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load room');
      setRoomData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load room');
      setIsLoading(false);
    }
  }, [roomId]);

  // Process zap events and calculate amounts
  const processZaps = useCallback((
    zapEvents: Kind9735Event[],
    zapPayerProfiles: Map<string, Kind0Event>
  ): { 
    totalZapAmount: number; 
    zappers: Map<string, { pubkey: string; amount: number; profile: Kind0Event | null }>;
    zapDetails: ZapDetail[];
  } => {
    let totalZapAmount = 0;
    const zappers = new Map<string, { pubkey: string; amount: number; profile: Kind0Event | null }>();
    const zapDetails: ZapDetail[] = [];

    zapEvents.forEach(zap => {
      // Use shared helpers to extract zap information
      const amountSats = extractZapAmount(zap);
      // Convert sats to millisats (extractZapAmount returns sats)
      const amount = amountSats * 1000;
      const zapPayerPubkey = extractZapPayerPubkey(zap);
      const zapMessage = extractZapContent(zap);

      if (amount > 0) {
        totalZapAmount += amount;
        const existing = zappers.get(zapPayerPubkey);
        if (existing) {
          existing.amount += amount;
        } else {
          zappers.set(zapPayerPubkey, {
            pubkey: zapPayerPubkey,
            amount,
            profile: zapPayerProfiles.get(zapPayerPubkey) || null
          });
        }

        // Store detailed zap information
        zapDetails.push({
          zap,
          amount,
          payerPubkey: zapPayerPubkey,
          profile: zapPayerProfiles.get(zapPayerPubkey) || null,
          message: zapMessage,
          timestamp: zap.created_at
        });
      }
    });

    return { totalZapAmount, zappers, zapDetails };
  }, []);

  // Calculate statistics using batched loading
  const calculateStats = useCallback(async (room: RoomState): Promise<Stats> => {
    if (!nostrClientRef.current) {
      throw new Error('Nostr client not initialized');
    }

    // Stage 1: Collect all live references and parse eventIds
    setLoadingStage('Collecting live references...');
    setLoadingProgress({ current: 0, total: 1 });
    
    const allLiveRefs = new Set<string>();
    const refToEventId = new Map<string, string>();
    
    // Add default items
    room.config.defaultItems.forEach(ref => allLiveRefs.add(ref));
    
    // Add schedule items
    if (room.schedule?.slots) {
      room.schedule.slots.forEach(slot => {
        slot.lives.forEach(live => allLiveRefs.add(live.ref));
      });
    }

    // Parse all refs to eventIds
    const eventIds: string[] = [];
    Array.from(allLiveRefs).forEach(ref => {
      const eventId = parseLiveRef(ref);
      if (eventId) {
        eventIds.push(eventId);
        refToEventId.set(ref, eventId);
      }
    });

    if (eventIds.length === 0) {
      return {
        totalLives: 0,
        totalNotes: 0,
        totalZaps: 0,
        totalZapAmount: 0,
        uniqueZappers: 0,
        notes: [],
        topZappers: [],
        topPerformingLives: [],
        dateRange: { earliest: null, latest: null }
      };
    }

    // Stage 2: Batch load all notes
    setLoadingStage(`Loading ${eventIds.length} notes...`);
    setLoadingProgress({ current: 0, total: eventIds.length });
    
    const allNotes = await nostrClientRef.current.getEvents([
      { kinds: [1], ids: eventIds }
    ]) as Kind1Event[];

    // Create a map of eventId -> note
    const noteMap = new Map<string, Kind1Event>();
    allNotes.forEach(note => {
      if (eventIds.includes(note.id)) {
        noteMap.set(note.id, note);
      }
    });

    setLoadingProgress({ current: eventIds.length, total: eventIds.length });

    // Stage 2.5: Extract author pubkeys and batch load author profiles
    setLoadingStage('Loading author profiles...');
    setLoadingProgress({ current: 0, total: 1 });
    
    const authorPubkeys = new Set<string>();
    allNotes.forEach(note => {
      if (note.pubkey) {
        authorPubkeys.add(note.pubkey);
      }
    });

    const authorProfiles = authorPubkeys.size > 0
      ? await ensureProfiles(
          getQueryClient(),
          nostrClientRef.current,
          Array.from(authorPubkeys)
        )
      : new Map<string, Kind0Event>();

    setLoadingProgress({ current: 1, total: 1 });

    // Stage 3: Batch load all zaps
    setLoadingStage(`Loading zaps for ${eventIds.length} notes...`);
    setLoadingProgress({ current: 0, total: 1 });
    
    const allZapEvents = await ensureZaps(
      getQueryClient(),
      nostrClientRef.current,
      eventIds
    );

    // Organize zaps by eventId
    const zapsByEventId = new Map<string, Kind9735Event[]>();
    eventIds.forEach(eventId => {
      zapsByEventId.set(eventId, []);
    });
    
    allZapEvents.forEach(zap => {
      const eTag = zap.tags.find(tag => tag[0] === 'e');
      if (eTag && eTag[1] && eventIds.includes(eTag[1])) {
        const existing = zapsByEventId.get(eTag[1]) || [];
        existing.push(zap);
        zapsByEventId.set(eTag[1], existing);
      }
    });

    setLoadingProgress({ current: 1, total: 1 });

    // Stage 4: Extract all unique zap payer pubkeys
    setLoadingStage('Extracting zap payer information...');
    setLoadingProgress({ current: 0, total: 1 });
    
    const zapPayerPubkeys = new Set<string>();
    allZapEvents.forEach(zap => {
      // Use shared helper to extract payer pubkey (handles both named and anonymous zaps)
      const zapPayerPubkey = extractZapPayerPubkey(zap);
      zapPayerPubkeys.add(zapPayerPubkey);
    });

    // Stage 5: Batch load all profiles
    setLoadingStage(`Loading ${zapPayerPubkeys.size} profiles...`);
    setLoadingProgress({ current: 0, total: 1 });
    
    const zapPayerProfiles = zapPayerPubkeys.size > 0
      ? await ensureProfiles(
          getQueryClient(),
          nostrClientRef.current,
          Array.from(zapPayerPubkeys)
        )
      : new Map<string, Kind0Event>();

    setLoadingProgress({ current: 1, total: 1 });

    // Stage 6: Process all data and create NoteData objects
    setLoadingStage('Processing data and calculating statistics...');
    setLoadingProgress({ current: 0, total: eventIds.length });
    
    const notes: NoteData[] = [];
    
    refToEventId.forEach((eventId, ref) => {
      const note = noteMap.get(eventId) || null;
      const zapEvents = zapsByEventId.get(eventId) || [];
      const authorProfile = note ? (authorProfiles.get(note.pubkey) || null) : null;
      
      // Process zaps for this event
      const { totalZapAmount, zappers, zapDetails } = processZaps(zapEvents, zapPayerProfiles);
      
      notes.push({
        eventId,
        originalRef: ref,
        note,
        authorProfile,
        zaps: zapEvents,
        zapDetails,
        zapAmount: totalZapAmount,
        zapCount: zapEvents.length,
        zappers
      });
      
      setLoadingProgress({ current: notes.length, total: eventIds.length });
    });

    // Stage 7: Aggregate statistics
    setLoadingStage('Calculating final statistics...');
    setLoadingProgress({ current: 0, total: 1 });
    
    const zapperMap = new Map<string, ZapperStats>();
    let totalZapAmount = 0;
    let totalZaps = 0;
    let earliestDate: number | null = null;
    let latestDate: number | null = null;

    notes.forEach(noteData => {
      totalZaps += noteData.zapCount;
      totalZapAmount += noteData.zapAmount;

      // Update date range
      if (noteData.note) {
        const noteDate = noteData.note.created_at;
        if (earliestDate === null || noteDate < earliestDate) {
          earliestDate = noteDate;
        }
        if (latestDate === null || noteDate > latestDate) {
          latestDate = noteDate;
        }
      }

      noteData.zaps.forEach(zap => {
        const zapDate = zap.created_at;
        if (earliestDate === null || zapDate < earliestDate) {
          earliestDate = zapDate;
        }
        if (latestDate === null || zapDate > latestDate) {
          latestDate = zapDate;
        }
      });

      // Aggregate zappers
      noteData.zappers.forEach((zapper, pubkey) => {
        const existing = zapperMap.get(pubkey);
        if (existing) {
          existing.totalAmount += zapper.amount;
          existing.zapCount += 1;
        } else {
          zapperMap.set(pubkey, {
            pubkey,
            totalAmount: zapper.amount,
            zapCount: 1,
            profile: zapper.profile
          });
        }
      });
    });

    // Sort top zappers
    const topZappers = Array.from(zapperMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 20);

    // Calculate top performing lives
    // Score is based on: zap amount (70%) + zap count (20%) + unique zappers (10%)
    // Normalized to 0-100 scale for fair comparison
    const maxZapAmount = Math.max(...notes.map(n => n.zapAmount), 1);
    const maxZapCount = Math.max(...notes.map(n => n.zapCount), 1);
    const maxUniqueZappers = Math.max(...notes.map(n => n.zappers.size), 1);

    const livesWithScores = notes.map(noteData => {
      const amountScore = (noteData.zapAmount / maxZapAmount) * 70;
      const countScore = (noteData.zapCount / maxZapCount) * 20;
      const zappersScore = (noteData.zappers.size / maxUniqueZappers) * 10;
      const score = amountScore + countScore + zappersScore;
      
      return {
        noteData,
        rank: 0, // Will be set after sorting
        score
      };
    });

    // Sort by score (descending) and assign ranks
    const topPerformingLives = livesWithScores
      .sort((a, b) => b.score - a.score)
      .map((item, index) => ({
        ...item,
        rank: index + 1
      }))
      .slice(0, 20); // Top 20

    setLoadingProgress({ current: 1, total: 1 });
    setLoadingStage('');

    return {
      totalLives: allLiveRefs.size,
      totalNotes: notes.filter(n => n.note !== null).length,
      totalZaps,
      totalZapAmount,
      uniqueZappers: zapperMap.size,
      notes,
      topZappers,
      topPerformingLives,
      dateRange: { earliest: earliestDate, latest: latestDate }
    };
  }, [parseLiveRef, processZaps]);

  // Load and update statistics
  const updateStats = useCallback(async (force = false) => {
    if (!roomData || !nostrClientRef.current) return;
    
    // Prevent concurrent updates
    if (isUpdatingRef.current && !force) {
      console.log('Update already in progress, skipping...');
      return;
    }

    try {
      isUpdatingRef.current = true;
      setIsLoading(true);
      const newStats = await calculateStats(roomData);
      setStats(newStats);
      setLastUpdate(new Date());
      setError(null);
      
      // Update eventIds ref for subscriptions
      eventIdsRef.current = newStats.notes.map(n => n.eventId).filter(Boolean);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate statistics');
      console.error('Failed to update stats:', err);
    } finally {
      setIsLoading(false);
      isUpdatingRef.current = false;
    }
  }, [roomData, calculateStats]);

  // Subscribe to real-time updates
  const subscribeToUpdates = useCallback(() => {
    if (!roomData || !nostrClientRef.current) return;

    // Use ref to avoid dependency on stats
    const eventIds = eventIdsRef.current.length > 0 ? eventIdsRef.current : (stats?.notes.map(n => n.eventId).filter(Boolean) || []);
    if (eventIds.length === 0) return;

    // Unsubscribe from previous subscriptions
    subscriptionRefs.current.forEach(sub => sub.unsubscribe());
    subscriptionRefs.current = [];

    // Debounced update function
    const debouncedUpdate = () => {
      // Clear any pending updates
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      
      // Schedule update with debounce
      updateTimeoutRef.current = setTimeout(() => {
        updateStats();
      }, 2000); // 2 second debounce
    };

    // Subscribe to new zaps
    const subscription = nostrClientRef.current.subscribeToEvents(
      [{ kinds: [9735], '#e': eventIds }],
      async (zapEvent) => {
        // New zap received, debounced refresh
        debouncedUpdate();
      },
      {}
    );

    subscriptionRefs.current.push(subscription);
  }, [roomData, updateStats, stats]);

  // Initial load
  useEffect(() => {
    loadRoomData();
  }, [loadRoomData]);

  // Update stats when room data is loaded
  useEffect(() => {
    if (roomData) {
      updateStats();
    }
  }, [roomData, updateStats]);

  // Reset top lives to show when stats change
  useEffect(() => {
    if (stats) {
      setTopLivesToShow(10); // Reset to top 10 when new stats load
    }
  }, [stats?.topPerformingLives.length]);

  // Subscribe to updates when stats are ready (only once, not on every stats change)
  useEffect(() => {
    if (stats && nostrClientRef.current && eventIdsRef.current.length > 0) {
      // Only subscribe if we don't already have subscriptions
      if (subscriptionRefs.current.length === 0) {
        subscribeToUpdates();
      }
    }
    
    return () => {
      // Cleanup subscriptions on unmount
      subscriptionRefs.current.forEach(sub => sub.unsubscribe());
      subscriptionRefs.current = [];
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [stats?.notes.length, subscribeToUpdates]); // Only re-subscribe if number of notes changes

  // Periodic refresh (every 60 seconds, less aggressive)
  useEffect(() => {
    if (!roomData) return;
    
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
    }
    
    // Only refresh if not currently updating
    updateIntervalRef.current = setInterval(() => {
      if (roomData && !isUpdatingRef.current) {
        updateStats();
      }
    }, 60000); // Increased to 60 seconds

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [roomData, updateStats]);

  // Format sats
  const formatSats = (millisats: number): string => {
    const sats = Math.floor(millisats / 1000);
    return sats.toLocaleString();
  };

  // Format date
  const formatDate = (timestamp: number | null): string => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Get display name from profile
  const getDisplayName = (profile: Kind0Event | null, pubkey: string): string => {
    if (!profile) return pubkey.substring(0, 16) + '...';
    try {
      const data = JSON.parse(profile.content || '{}');
      return data.display_name || data.name || pubkey.substring(0, 16) + '...';
    } catch {
      return pubkey.substring(0, 16) + '...';
    }
  };

  // Get profile picture (sanitized)
  const getProfilePicture = (profile: Kind0Event | null): string | null => {
    if (!profile) return null;
    try {
      const data = JSON.parse(profile.content || '{}');
      return sanitizeImageUrl(data.picture) || null;
    } catch {
      return null;
    }
  };

  if (error && !roomData) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
        padding: 20,
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{ fontSize: 18, color: '#ef4444' }}>Error</div>
        <div style={{ color: '#6b7280' }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f9fafb',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: '#111827' }}>
            {roomData?.config.name || 'Multi LIVE'} - Statistics
          </h1>
          <div style={{ marginTop: 4, fontSize: 14, color: '#6b7280' }}>
            Last updated: {lastUpdate.toLocaleTimeString()}
            {isLoading && <span style={{ marginLeft: 8, color: '#4a75ff' }}>Updating...</span>}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          Room ID: {roomId}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
        {isLoading && !stats ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 400,
            gap: 16
          }}>
            <div style={{
              fontSize: 18,
              fontWeight: 600,
              color: '#111827',
              marginBottom: 8
            }}>
              {loadingStage || 'Loading statistics...'}
            </div>
            {loadingProgress.total > 0 && (
              <>
                <div style={{
                  width: '100%',
                  maxWidth: 400,
                  height: 8,
                  backgroundColor: '#e5e7eb',
                  borderRadius: 4,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${(loadingProgress.current / loadingProgress.total) * 100}%`,
                    height: '100%',
                    backgroundColor: '#4a75ff',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                <div style={{
                  fontSize: 14,
                  color: '#6b7280'
                }}>
                  {loadingProgress.current} / {loadingProgress.total}
                </div>
              </>
            )}
            <div style={{
              fontSize: 14,
              color: '#9ca3af',
              marginTop: 8
            }}>
              This may take a moment...
            </div>
          </div>
        ) : stats ? (
          <>
            {/* Overview Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
              marginBottom: 32
            }}>
              <div style={{
                backgroundColor: '#ffffff',
                padding: 20,
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>Total Lives</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#111827' }}>{stats.totalLives}</div>
              </div>
              <div style={{
                backgroundColor: '#ffffff',
                padding: 20,
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>Total Notes</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#111827' }}>{stats.totalNotes}</div>
              </div>
              <div style={{
                backgroundColor: '#ffffff',
                padding: 20,
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>Total Zaps</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#111827' }}>{stats.totalZaps}</div>
              </div>
              <div style={{
                backgroundColor: '#ffffff',
                padding: 20,
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>Total Amount</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#4a75ff' }}>{formatSats(stats.totalZapAmount)}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>sats</div>
              </div>
              <div style={{
                backgroundColor: '#ffffff',
                padding: 20,
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>Unique Zappers</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#111827' }}>{stats.uniqueZappers}</div>
              </div>
            </div>

            {/* Date Range */}
            {(stats.dateRange.earliest || stats.dateRange.latest) && (
              <div style={{
                backgroundColor: '#ffffff',
                padding: 16,
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                marginBottom: 32,
                fontSize: 14,
                color: '#6b7280'
              }}>
                <strong>Date Range:</strong> {formatDate(stats.dateRange.earliest)} - {formatDate(stats.dateRange.latest)}
              </div>
            )}

            {/* Top Performing Lives */}
            {stats.topPerformingLives.length > 0 && (
              <div style={{
                backgroundColor: '#ffffff',
                padding: 24,
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                marginBottom: 32
              }}>
                <h2 style={{ margin: '0 0 20px 0', fontSize: 20, fontWeight: 600, color: '#111827' }}>
                  Top Performing Lives
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {stats.topPerformingLives.slice(0, topLivesToShow).map((livePerf, idx) => {
                    const { noteData, rank, score } = livePerf;
                    const authorPicture = noteData.authorProfile ? (() => {
                      try {
                        const profileData = JSON.parse(noteData.authorProfile.content || '{}');
                        return sanitizeImageUrl(profileData.picture) || null;
                      } catch {
                        return null;
                      }
                    })() : null;
                    
                    return (
                      <div 
                        key={noteData.eventId}
                        onClick={() => {
                          setSelectedLive(noteData);
                          setShowLiveDetails(true);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: 16,
                          backgroundColor: idx < 3 ? '#f9fafb' : 'transparent',
                          borderRadius: 8,
                          border: '1px solid #e5e7eb',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          const target = e.currentTarget;
                          requestAnimationFrame(() => {
                            if (target && target.style) {
                              target.style.backgroundColor = '#f3f4f6';
                              target.style.borderColor = '#4a75ff';
                            }
                          });
                        }}
                        onMouseLeave={(e) => {
                          const target = e.currentTarget;
                          requestAnimationFrame(() => {
                            if (target && target.style) {
                              target.style.backgroundColor = idx < 3 ? '#f9fafb' : 'transparent';
                              target.style.borderColor = '#e5e7eb';
                            }
                          });
                        }}
                      >
                        {/* Rank Badge */}
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          backgroundColor: idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : '#e5e7eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 18,
                          fontWeight: 700,
                          color: idx < 3 ? '#ffffff' : '#6b7280',
                          flexShrink: 0
                        }}>
                          {rank}
                        </div>
                        
                        {/* Author/Note Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            {authorPicture && (
                              <img 
                                src={authorPicture} 
                                alt="" 
                                style={{ 
                                  width: 24, 
                                  height: 24, 
                                  borderRadius: '50%',
                                  objectFit: 'cover'
                                }} 
                              />
                            )}
                            <div style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>
                              {noteData.note && noteData.authorProfile 
                                ? getDisplayName(noteData.authorProfile, noteData.note.pubkey)
                                : `Live #${rank}`}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>
                            {noteData.zapCount} zap{noteData.zapCount !== 1 ? 's' : ''} • {noteData.zappers.size} zapper{noteData.zappers.size !== 1 ? 's' : ''}
                          </div>
                          {noteData.note && (
                            <div style={{ 
                              fontSize: 12, 
                              color: '#9ca3af', 
                              marginTop: 4,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {noteData.note.content.substring(0, 60)}...
                            </div>
                          )}
                        </div>
                        
                        {/* Performance Metrics */}
                        <div style={{ textAlign: 'right', marginLeft: 16 }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#4a75ff' }}>
                            {formatSats(noteData.zapAmount)}
                          </div>
                          <div style={{ fontSize: 12, color: '#9ca3af' }}>sats</div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                            Score: {score.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Load More Button */}
                {stats.topPerformingLives.length > topLivesToShow && (
                  <div style={{ marginTop: 16, textAlign: 'center' }}>
                    <button
                      onClick={() => setTopLivesToShow(prev => Math.min(prev + 10, stats.topPerformingLives.length))}
                      style={{
                        padding: '10px 24px',
                        backgroundColor: '#4a75ff',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        const target = e.currentTarget;
                        requestAnimationFrame(() => {
                          if (target && target.style) {
                            target.style.backgroundColor = '#3b65e6';
                          }
                        });
                      }}
                      onMouseLeave={(e) => {
                        const target = e.currentTarget;
                        requestAnimationFrame(() => {
                          if (target && target.style) {
                            target.style.backgroundColor = '#4a75ff';
                          }
                        });
                      }}
                    >
                      Load More ({stats.topPerformingLives.length - topLivesToShow} remaining)
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Top Zappers */}
            {stats.topZappers.length > 0 && (
              <div style={{
                backgroundColor: '#ffffff',
                padding: 24,
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                marginBottom: 32
              }}>
                <h2 style={{ margin: '0 0 20px 0', fontSize: 20, fontWeight: 600, color: '#111827' }}>
                  Top Zappers
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {stats.topZappers.map((zapper, idx) => {
                    const picture = getProfilePicture(zapper.profile);
                    return (
                      <div key={zapper.pubkey} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: 12,
                        backgroundColor: idx < 3 ? '#f9fafb' : 'transparent',
                        borderRadius: 8
                      }}>
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          backgroundColor: '#e5e7eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 18,
                          fontWeight: 600,
                          color: '#6b7280',
                          flexShrink: 0,
                          overflow: 'hidden'
                        }}>
                          {picture ? (
                            <img src={picture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            '#'
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: '#111827' }}>
                            {getDisplayName(zapper.profile, zapper.pubkey)}
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>
                            {zapper.zapCount} zap{zapper.zapCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, color: '#4a75ff', fontSize: 18 }}>
                            {formatSats(zapper.totalAmount)}
                          </div>
                          <div style={{ fontSize: 12, color: '#9ca3af' }}>sats</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Accounting Verification */}
            <div style={{
              backgroundColor: '#ffffff',
              padding: 24,
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              marginBottom: 32
            }}>
              <h2 style={{ margin: '0 0 20px 0', fontSize: 20, fontWeight: 600, color: '#111827' }}>
                Accounting Verification
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
                <div style={{ padding: 16, backgroundColor: '#f9fafb', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Sum of All Individual Zaps</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>
                    {formatSats(stats.notes.reduce((sum, n) => sum + n.zapAmount, 0))}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>sats</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                    ({stats.notes.reduce((sum, n) => sum + n.zapDetails.length, 0)} zap events)
                  </div>
                </div>
                <div style={{ padding: 16, backgroundColor: '#f9fafb', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Sum of All Zap Details</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>
                    {formatSats(stats.notes.reduce((sum, n) => sum + n.zapDetails.reduce((s, z) => s + z.amount, 0), 0))}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>sats</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                    (from individual zap records)
                  </div>
                </div>
                <div style={{ padding: 16, backgroundColor: '#f9fafb', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Displayed Total</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#4a75ff' }}>
                    {formatSats(stats.totalZapAmount)}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>sats</div>
                </div>
                <div style={{ padding: 16, backgroundColor: '#f9fafb', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Verification</div>
                  <div style={{ 
                    fontSize: 24, 
                    fontWeight: 700, 
                    color: stats.notes.reduce((sum, n) => sum + n.zapDetails.reduce((s, z) => s + z.amount, 0), 0) === stats.totalZapAmount ? '#10b981' : '#ef4444'
                  }}>
                    {stats.notes.reduce((sum, n) => sum + n.zapDetails.reduce((s, z) => s + z.amount, 0), 0) === stats.totalZapAmount ? '✓ Match' : '✗ Mismatch'}
                  </div>
                  {stats.notes.reduce((sum, n) => sum + n.zapDetails.reduce((s, z) => s + z.amount, 0), 0) !== stats.totalZapAmount && (
                    <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
                      Diff: {formatSats(Math.abs(stats.notes.reduce((sum, n) => sum + n.zapDetails.reduce((s, z) => s + z.amount, 0), 0) - stats.totalZapAmount))} sats
                    </div>
                  )}
                </div>
              </div>
              <div style={{ 
                padding: 12, 
                backgroundColor: stats.notes.every(n => n.zapDetails.reduce((s, z) => s + z.amount, 0) === n.zapAmount) ? '#ecfdf5' : '#fef2f2',
                borderRadius: 8,
                border: `1px solid ${stats.notes.every(n => n.zapDetails.reduce((s, z) => s + z.amount, 0) === n.zapAmount) ? '#10b981' : '#ef4444'}`,
                fontSize: 13,
                color: stats.notes.every(n => n.zapDetails.reduce((s, z) => s + z.amount, 0) === n.zapAmount) ? '#065f46' : '#991b1b'
              }}>
                <strong>Per-Live Verification:</strong> {stats.notes.filter(n => n.zapDetails.reduce((s, z) => s + z.amount, 0) === n.zapAmount).length} of {stats.notes.length} lives verified
                {stats.notes.some(n => n.zapDetails.reduce((s, z) => s + z.amount, 0) !== n.zapAmount) && (
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    Some lives have accounting mismatches. Click on individual lives to see details.
                  </div>
                )}
              </div>
            </div>

            {/* Per-Live Breakdown */}
            <div style={{
              backgroundColor: '#ffffff',
              padding: 24,
              borderRadius: 12,
              border: '1px solid #e5e7eb'
            }}>
              <h2 style={{ margin: '0 0 20px 0', fontSize: 20, fontWeight: 600, color: '#111827' }}>
                Per-Live Breakdown
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {stats.notes.map((noteData, idx) => (
                  <div 
                    key={noteData.eventId} 
                    onClick={() => {
                      setSelectedLive(noteData);
                      setShowLiveDetails(true);
                    }}
                    style={{
                      padding: 16,
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      backgroundColor: '#f9fafb',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      // Use requestAnimationFrame for smooth updates
                      const target = e.currentTarget;
                      requestAnimationFrame(() => {
                        if (target && target.style) {
                          target.style.backgroundColor = '#f3f4f6';
                          target.style.borderColor = '#4a75ff';
                        }
                      });
                    }}
                    onMouseLeave={(e) => {
                      const target = e.currentTarget;
                      requestAnimationFrame(() => {
                        if (target && target.style) {
                          target.style.backgroundColor = '#f9fafb';
                          target.style.borderColor = '#e5e7eb';
                        }
                      });
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>
                          Live #{idx + 1} - {noteData.eventId.substring(0, 16)}...
                        </div>
                        {noteData.note && noteData.authorProfile && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <div style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              backgroundColor: '#e5e7eb',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#6b7280',
                              flexShrink: 0,
                              overflow: 'hidden'
                            }}>
                              {(() => {
                                try {
                                  const profileData = JSON.parse(noteData.authorProfile.content || '{}');
                                  if (profileData.picture) {
                                    const sanitized = sanitizeImageUrl(profileData.picture);
                                    return sanitized ? <img src={sanitized} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null;
                                  }
                                } catch {}
                                return '#';
                              })()}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                                {getDisplayName(noteData.authorProfile, noteData.note.pubkey)}
                              </div>
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                                Author
                              </div>
                            </div>
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>
                          Ref: {noteData.originalRef.substring(0, 30)}...
                        </div>
                        {noteData.note ? (
                          <>
                            <div style={{ fontSize: 11, color: noteData.note.id === noteData.eventId ? '#10b981' : '#ef4444', marginBottom: 4 }}>
                              Note ID: {noteData.note.id.substring(0, 16)}... {noteData.note.id === noteData.eventId ? '✓' : '✗ MISMATCH!'}
                            </div>
                            <div style={{
                              fontSize: 14,
                              color: '#111827',
                              marginTop: 8,
                              maxHeight: 100,
                              overflow: 'auto'
                            }}>
                              {noteData.note.content.substring(0, 200)}
                              {noteData.note.content.length > 200 && '...'}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>
                            Note not found for this event ID
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: '#4a75ff', marginTop: 8, fontWeight: 500 }}>
                          Click to view full details →
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', marginLeft: 16 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#4a75ff' }}>
                          {formatSats(noteData.zapAmount)}
                        </div>
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>sats</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                          {noteData.zapCount} zap{noteData.zapCount !== 1 ? 's' : ''}
                        </div>
                        {noteData.zapDetails.length > 0 && (
                          <div style={{ 
                            fontSize: 11, 
                            color: noteData.zapDetails.reduce((sum, z) => sum + z.amount, 0) === noteData.zapAmount ? '#10b981' : '#ef4444',
                            marginTop: 4,
                            fontWeight: 600
                          }}>
                            {noteData.zapDetails.reduce((sum, z) => sum + z.amount, 0) === noteData.zapAmount ? '✓ Verified' : '✗ Check'}
                          </div>
                        )}
                      </div>
                    </div>
                    {noteData.zappers.size > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Top Zappers:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {Array.from(noteData.zappers.values())
                            .sort((a, b) => b.amount - a.amount)
                            .slice(0, 5)
                            .map(zapper => (
                              <div key={zapper.pubkey} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 8px',
                                backgroundColor: '#ffffff',
                                borderRadius: 6,
                                fontSize: 12
                              }}>
                                <span style={{ color: '#111827' }}>
                                  {getDisplayName(zapper.profile, zapper.pubkey)}
                                </span>
                                <span style={{ color: '#4a75ff', fontWeight: 600 }}>
                                  {formatSats(zapper.amount)} sats
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Live Details Overlay */}
      {showLiveDetails && selectedLive && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20
          }}
          onClick={() => {
            setShowLiveDetails(false);
            setSelectedLive(null);
          }}
        >
          <div 
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 12,
              maxWidth: 900,
              maxHeight: '90vh',
              width: '100%',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: 24,
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              position: 'sticky',
              top: 0,
              backgroundColor: '#ffffff',
              zIndex: 10
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: '#111827' }}>
                  Live Details
                </h2>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  Event ID: {selectedLive.eventId}
                </div>
              </div>
              <button
                onClick={() => {
                  setShowLiveDetails(false);
                  setSelectedLive(null);
                }}
                style={{
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 18
                }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: 24 }}>
              {/* Author Information */}
              {selectedLive.note && selectedLive.authorProfile && (
                <div style={{ marginBottom: 32 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                    Author
                  </h3>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 16,
                    backgroundColor: '#f9fafb',
                    borderRadius: 8,
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      backgroundColor: '#e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      fontWeight: 600,
                      color: '#6b7280',
                      flexShrink: 0,
                      overflow: 'hidden'
                    }}>
                      {(() => {
                        try {
                          const profileData = JSON.parse(selectedLive.authorProfile.content || '{}');
                          if (profileData.picture) {
                            const sanitized = sanitizeImageUrl(profileData.picture);
                            return sanitized ? <img src={sanitized} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null;
                          }
                        } catch {}
                        return '#';
                      })()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
                        {getDisplayName(selectedLive.authorProfile, selectedLive.note.pubkey)}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                        {selectedLive.note.pubkey}
                      </div>
                      {(() => {
                        try {
                          const profileData = JSON.parse(selectedLive.authorProfile.content || '{}');
                          if (profileData.about) {
                            return (
                              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                                {profileData.about}
                              </div>
                            );
                          }
                        } catch {}
                        return null;
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Note Content */}
              {selectedLive.note && (
                <div style={{ marginBottom: 32 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                    Note Content
                  </h3>
                  <div style={{
                    padding: 16,
                    backgroundColor: '#f9fafb',
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 14,
                    color: '#111827',
                    maxHeight: 300,
                    overflow: 'auto'
                  }}>
                    {selectedLive.note.content || '(No content)'}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                    Created: {formatDate(selectedLive.note.created_at)}
                  </div>
                </div>
              )}

              {/* Accounting for this Live */}
              <div style={{ marginBottom: 32 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                  Accounting Verification
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div style={{ padding: 16, backgroundColor: '#f9fafb', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Sum of All Zaps</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>
                      {formatSats(selectedLive.zapDetails.reduce((sum, z) => sum + z.amount, 0))}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>sats</div>
                  </div>
                  <div style={{ padding: 16, backgroundColor: '#f9fafb', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Displayed Total</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#4a75ff' }}>
                      {formatSats(selectedLive.zapAmount)}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>sats</div>
                  </div>
                  <div style={{ padding: 16, backgroundColor: '#f9fafb', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Verification</div>
                    <div style={{ 
                      fontSize: 20, 
                      fontWeight: 700, 
                      color: selectedLive.zapDetails.reduce((sum, z) => sum + z.amount, 0) === selectedLive.zapAmount ? '#10b981' : '#ef4444'
                    }}>
                      {selectedLive.zapDetails.reduce((sum, z) => sum + z.amount, 0) === selectedLive.zapAmount ? '✓ Match' : '✗ Mismatch'}
                    </div>
                    {selectedLive.zapDetails.reduce((sum, z) => sum + z.amount, 0) !== selectedLive.zapAmount && (
                      <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>
                        Diff: {formatSats(Math.abs(selectedLive.zapDetails.reduce((sum, z) => sum + z.amount, 0) - selectedLive.zapAmount))} sats
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* All Zappers */}
              {selectedLive.zappers.size > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                    All Zappers ({selectedLive.zappers.size})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Array.from(selectedLive.zappers.values())
                      .sort((a, b) => b.amount - a.amount)
                      .map(zapper => {
                        const picture = getProfilePicture(zapper.profile);
                        return (
                          <div key={zapper.pubkey} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: 12,
                            backgroundColor: '#f9fafb',
                            borderRadius: 8,
                            border: '1px solid #e5e7eb'
                          }}>
                            <div style={{
                              width: 48,
                              height: 48,
                              borderRadius: '50%',
                              backgroundColor: '#e5e7eb',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 18,
                              fontWeight: 600,
                              color: '#6b7280',
                              flexShrink: 0,
                              overflow: 'hidden'
                            }}>
                              {picture ? (
                                <img src={picture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                '#'
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>
                                {getDisplayName(zapper.profile, zapper.pubkey)}
                              </div>
                              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                                {zapper.pubkey}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, color: '#4a75ff', fontSize: 18 }}>
                                {formatSats(zapper.amount)}
                              </div>
                              <div style={{ fontSize: 12, color: '#9ca3af' }}>sats</div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* All Zaps */}
              {selectedLive.zapDetails.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                    All Zaps ({selectedLive.zapDetails.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflow: 'auto' }}>
                    {selectedLive.zapDetails
                      .sort((a, b) => b.timestamp - a.timestamp)
                      .map((zapDetail, idx) => {
                        const picture = getProfilePicture(zapDetail.profile);
                        return (
                          <div key={zapDetail.zap.id} style={{
                            padding: 16,
                            backgroundColor: '#f9fafb',
                            borderRadius: 8,
                            border: '1px solid #e5e7eb'
                          }}>
                            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                              <div style={{
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                backgroundColor: '#e5e7eb',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 14,
                                fontWeight: 600,
                                color: '#6b7280',
                                flexShrink: 0,
                                overflow: 'hidden'
                              }}>
                                {picture ? (
                                  <img src={picture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  '#'
                                )}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>
                                  {getDisplayName(zapDetail.profile, zapDetail.payerPubkey)}
                                </div>
                                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                                  {formatDate(zapDetail.timestamp)}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 700, color: '#4a75ff', fontSize: 18 }}>
                                  {formatSats(zapDetail.amount)}
                                </div>
                                <div style={{ fontSize: 12, color: '#9ca3af' }}>sats</div>
                              </div>
                            </div>
                            {zapDetail.message && (
                              <div style={{
                                marginTop: 8,
                                padding: 12,
                                backgroundColor: '#ffffff',
                                borderRadius: 6,
                                fontSize: 14,
                                color: '#111827',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word'
                              }}>
                                {zapDetail.message}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
                              Zap ID: {zapDetail.zap.id.substring(0, 16)}...
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

