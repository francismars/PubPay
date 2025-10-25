const express = require('express');
const router = express.Router();

// YouTube oEmbed endpoint (no API key required)
router.get('/search', async (req, res) => {
    const { q } = req.query;
    
    console.log('YouTube search request received:', { q, timestamp: new Date().toISOString() });
    
    if (!q) {
        return res.status(400).json({ error: 'Search query parameter "q" is required' });
    }
    
    try {
        // Check if it's already a YouTube URL
        let videoId = null;
        if (q.includes('youtube.com/watch?v=') || q.includes('youtu.be/')) {
            // Extract video ID from URL
            const urlMatch = q.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (urlMatch) {
                videoId = urlMatch[1];
            }
        }
        
        if (!videoId) {
            // For search terms, we'll redirect to YouTube search
            // This is a limitation of oEmbed - it only works with direct video URLs
            console.log('Search term provided, but oEmbed only works with direct video URLs');
            return res.json({
                type: 'search',
                searchTerm: q,
                message: 'Please provide a direct YouTube URL for automatic info extraction'
            });
        }
        
        // Use oEmbed to get video information
        console.log('Fetching video info via oEmbed for video ID:', videoId);
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        
        const response = await fetch(oembedUrl);
        console.log('oEmbed response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('oEmbed error response:', errorText);
            throw new Error(`oEmbed responded with status: ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('oEmbed response data keys:', Object.keys(data));
        
        const result = {
            videoId: videoId,
            title: data.title,
            channelTitle: data.author_name,
            thumbnail: data.thumbnail_url,
            type: 'video'
        };
        
        res.json(result);
        
    } catch (error) {
        console.error('Error processing YouTube request:', error);
        res.status(500).json({ 
            error: 'Failed to process YouTube request', 
            details: error.message 
        });
    }
});

// New endpoint for getting video info from a video ID
router.get('/video/:videoId', async (req, res) => {
    const { videoId } = req.params;
    
    if (!videoId) {
        return res.status(400).json({ error: 'Video ID parameter is required' });
    }
    
    try {
        console.log('Fetching video info via oEmbed for video ID:', videoId);
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        
        const response = await fetch(oembedUrl);
        
        if (!response.ok) {
            throw new Error(`oEmbed responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        
        const result = {
            videoId: videoId,
            title: data.title,
            channelTitle: data.author_name,
            thumbnail: data.thumbnail_url,
            type: 'video'
        };
        
        res.json(result);
        
    } catch (error) {
        console.error('Error fetching video info:', error);
        res.status(500).json({ 
            error: 'Failed to fetch video info', 
            details: error.message 
        });
    }
});

module.exports = router;
