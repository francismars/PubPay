import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = (import.meta as unknown as { env?: { VITE_BACKEND_URL?: string } })?.env?.VITE_BACKEND_URL || 'http://localhost:3002';

export const RoomCreatePage: React.FC = () => {
	const navigate = useNavigate();
	const [name, setName] = useState('My Multi Room');
	const [rotationIntervalSec, setIntervalSec] = useState(60);
	const [rotationPolicy, setPolicy] = useState<'round_robin' | 'random' | 'weighted'>('round_robin');
	const [defaultItems, setDefaultItems] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const create = useCallback(async () => {
		setBusy(true); setError(null);
		try {
			const payload = {
				name: name || 'Untitled Room',
				rotationPolicy,
				rotationIntervalSec,
				defaultItems: defaultItems.split(/\n|,/) .map(s => s.trim()).filter(Boolean)
			};
			const res = await fetch(`${API_BASE}/rooms`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const json = await res.json();
			if (!json.success) throw new Error(json.error || 'Failed to create room');
			navigate(`/room/${json.data.id}/admin`);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : 'Error');
		} finally { setBusy(false); }
	}, [name, rotationPolicy, rotationIntervalSec, defaultItems, navigate]);

	return (
		<div className="live">
			<div id="noteLoaderContainer">
				<div id="noteLoader">
					<div className="note-loader-content">
						<div className="app-header">
							<h1>
								<span style={{ color: '#4a75ff' }}>PUB</span>
								<span style={{ color: '#000' }}>PAY</span>
								<span style={{ color: '#0000001c' }}>.me</span>{' '}
								<span style={{ color: '#5f5f5f' }}>Multi</span>
							</h1>
							<p className="app-description">Create a scheduled multi LIVE room</p>
						</div>

						<label>Room name</label>
						<input value={name} onChange={e => setName(e.target.value)} placeholder="Room name" />

						<label style={{ marginTop: 8 }}>Rotation policy</label>
						<select value={rotationPolicy} onChange={e => setPolicy(e.target.value as any)}>
							<option value="round_robin">round_robin</option>
							<option value="random">random</option>
							<option value="weighted">weighted</option>
						</select>

						<label style={{ marginTop: 8 }}>Rotation interval (sec)</label>
						<input type="number" value={rotationIntervalSec} onChange={e => setIntervalSec(parseInt(e.target.value || '60', 10))} />

						<label style={{ marginTop: 8 }}>Default items (comma or newline separated)</label>
						<textarea rows={4} value={defaultItems} onChange={e => setDefaultItems(e.target.value)} placeholder={'note1...\nnevent1...'} />

						<div className="button-container" style={{ marginTop: 12 }}>
							<button className="button" onClick={create} disabled={busy}>Create Multi Room</button>
							<button className="button outline" onClick={() => navigate(-1)}>Back</button>
						</div>

						{error && <div className="error-message" style={{ display: 'block', marginTop: 8 }}>{error}</div>}
					</div>
				</div>
			</div>
		</div>
	);
};


