export const domain = 'https://rslang-xulc.onrender.com';

export interface IBearer {
  bearer: string;
}

export const BEARER: IBearer = {
  bearer: `Bearer ${
    JSON.parse(localStorage.getItem('rslang-localStorage') as string)
      ? JSON.parse(localStorage.getItem('rslang-localStorage')!).token
      : null
  }`,
};

export const STATE = {
  auth: JSON.parse(localStorage.getItem('rslang-localStorage')!),
  userName: JSON.parse(localStorage.getItem('rslang-localStorage')!),
};

export const delayBorderHighlight = 2000;

export const MAX_COUNT_WORD_PER_PAGE = 20;

export const START_POINTS = 10;

export const COUNT_RIGHT_ANSWERS = 3;

export const TIME = 59;

export const ERROR_SOUND = 'error.mp3';
export const CORRECT_SOUND = 'correct.mp3';
