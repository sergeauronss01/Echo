-- Migration: Add MusicBrainz integration and fingerprinting tables
-- This migration adds support for MusicBrainz IDs, lyrics, and fingerprint verification

-- Add new columns to songs table for MusicBrainz support
ALTER TABLE songs ADD COLUMN IF NOT EXISTS mbid UUID;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS spotify_id VARCHAR(255);
ALTER TABLE songs ADD COLUMN IF NOT EXISTS acoustid UUID;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS acoustid_confidence DECIMAL(5,2);
ALTER TABLE songs ADD COLUMN IF NOT EXISTS lyrics_content TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS lyrics_source VARCHAR(100);
ALTER TABLE songs ADD COLUMN IF NOT EXISTS metadata_verified BOOLEAN DEFAULT false;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS review_status VARCHAR(50) DEFAULT 'pending';

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_songs_mbid ON songs(mbid);
CREATE INDEX IF NOT EXISTS idx_songs_acoustid ON songs(acoustid);
CREATE INDEX IF NOT EXISTS idx_songs_review_status ON songs(review_status);

-- Create fingerprint_matches table (fixes bug - this was referenced but not created)
CREATE TABLE IF NOT EXISTS fingerprint_matches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    song_id INTEGER,
    uploaded_fingerprint TEXT,
    matched_song_id INTEGER,
    confidence DECIMAL(5,2),
    matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (matched_song_id) REFERENCES songs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fingerprint_matches_user_id ON fingerprint_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_fingerprint_matches_matched_at ON fingerprint_matches(matched_at);

-- Create song_metadata_reviews table for manual review workflow
CREATE TABLE IF NOT EXISTS song_metadata_reviews (
    id SERIAL PRIMARY KEY,
    song_id INTEGER NOT NULL,
    youtube_id VARCHAR(255),
    mbid_proposed UUID,
    mbid_selected UUID,
    confidence_score DECIMAL(5,2),
    reviewed_by INTEGER,
    review_status VARCHAR(50) DEFAULT 'pending',
    review_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_song_metadata_reviews_status ON song_metadata_reviews(review_status);
CREATE INDEX IF NOT EXISTS idx_song_metadata_reviews_song_id ON song_metadata_reviews(song_id);

-- Create songs_lyrics table for lyrics storage and management
CREATE TABLE IF NOT EXISTS songs_lyrics (
    id SERIAL PRIMARY KEY,
    song_id INTEGER NOT NULL UNIQUE,
    lyrics_content TEXT,
    source VARCHAR(100),
    source_id VARCHAR(255),
    synced BOOLEAN DEFAULT false,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_songs_lyrics_song_id ON songs_lyrics(song_id);
