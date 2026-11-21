"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankForRating = void 0;
const rankForRating = (rating, count) => {
    if (count < 1)
        return 'Nuevo';
    if (rating >= 4.8)
        return 'Diamante';
    if (rating >= 4.5)
        return 'Platino';
    if (rating >= 4)
        return 'Oro';
    if (rating >= 3)
        return 'Plata';
    return 'Bronce';
};
exports.rankForRating = rankForRating;
