export class ScoringService {
    scoreCandidates(sourceTitle, sourceArtist, sourceDuration, candidates) {
        return candidates
            .map(candidate => ({
                ...candidate,
                score: this.calculateScore(
                    sourceTitle,
                    sourceArtist,
                    sourceDuration,
                    candidate.title,
                    candidate.artistCredit,
                    candidate.duration
                ),
            }))
            .sort((a, b) => b.score - a.score);
    }

    calculateScore(sourceTitle, sourceArtist, sourceDuration, candidateTitle, candidateArtist, candidateDuration) {
        let score = 0;

        score += this.scoreTitle(sourceTitle, candidateTitle) * 40;
        score += this.scoreArtist(sourceArtist, candidateArtist) * 40;
        score += this.scoreDuration(sourceDuration, candidateDuration) * 20;

        return Math.round(score);
    }

    scoreTitle(source, candidate) {
        if (!source || !candidate) return 0;

        const sourceLower = source.toLowerCase().trim();
        const candidateLower = candidate.toLowerCase().trim();

        if (sourceLower === candidateLower) return 1.0;

        const similarity = this.stringSimilarity(sourceLower, candidateLower);
        return Math.max(0, similarity);
    }

    scoreArtist(source, candidate) {
        if (!source || !candidate) return 0;

        const sourceLower = source.toLowerCase().trim();
        const candidateLower = candidate.toLowerCase().trim();

        if (sourceLower === candidateLower) return 1.0;

        const similarity = this.stringSimilarity(sourceLower, candidateLower);
        return Math.max(0, similarity);
    }

    scoreDuration(sourceDuration, candidateDuration) {
        if (!sourceDuration || !candidateDuration) return 0;

        const sourceMs = typeof sourceDuration === 'string' ? parseInt(sourceDuration) : sourceDuration;
        const candidateMs = typeof candidateDuration === 'string' ? parseInt(candidateDuration) : candidateDuration;

        const diffMs = Math.abs(sourceMs - candidateMs);
        const tolerance = 5000;

        if (diffMs <= tolerance) {
            return 1.0 - (diffMs / tolerance) * 0.5;
        }

        return 0;
    }

    stringSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;

        if (longer.length === 0) return 1.0;

        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    isAutoAcceptable(score) {
        return score >= 80;
    }

    requiresReview(score) {
        return score < 80 && score >= 60;
    }

    isRejectable(score) {
        return score < 60;
    }
}

export default new ScoringService();
