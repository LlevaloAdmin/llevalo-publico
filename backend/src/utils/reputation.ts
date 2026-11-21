export type ReputationRank = 'Nuevo' | 'Bronce' | 'Plata' | 'Oro' | 'Platino' | 'Diamante';

export const rankForRating = (rating: number, count: number): ReputationRank => {
  if (count < 1) return 'Nuevo';
  if (rating >= 4.8) return 'Diamante';
  if (rating >= 4.5) return 'Platino';
  if (rating >= 4) return 'Oro';
  if (rating >= 3) return 'Plata';
  return 'Bronce';
};
