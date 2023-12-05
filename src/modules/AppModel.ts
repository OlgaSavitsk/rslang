import { STATE } from '../core/constants/server-constants';
import AppView from '../core/View';
// eslint-disable-next-line import/no-cycle
import IWord from '../models/word-model';
import renderHeaderTemplate from '../components/Header/_renderHeaderTemplate';
// eslint-disable-next-line import/no-cycle
import AuthController from './Auth/AuthController';
import AuthModel from './Auth/AuthModel';
import AuthView from './Auth/AuthView';

const emojiList = [
  ['1', '🤐'],
  ['2', '🙄'],
  ['3', '🤤'],
  ['4', '🤓'],
  ['5', '😬'],
  ['6', '😭'],
  ['difficult', '🤡'],
];

type UserWord = {
  difficulty: string;
  optional: {
    answers: string;
    difficulty: boolean;
    easy: boolean;
  };
  id?: string;
  wordId?: string;
};

type UserStat = { learnedWords: number; optional: { data: StatDate[] } };

type GameStat = {
  words: string[];
  right: number;
  wrong: number;
  series: number;
};

type StatDate = {
  date: string;
  words: { words: number; easyQty: number };
  audioGame: GameStat;
  sprintGame: GameStat;
};

class AppModel {
  private domain = 'https://rslang-xulc.onrender.com';

  // === Статистика === //

  getStringDate(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = `0${date.getMonth() + 1}`.slice(-2);
    const day = `0${date.getDate()}`.slice(-2);

    return `${day}/${month}/${year}`;
  }

  async updateGameStat(game: 'audioGame' | 'sprintGame', data: GameStat) {
    try {
      const stat = await this.getStat();

      const date = this.getStringDate();
      const dayStat = stat.optional.data.find((elem) => elem.date === date);

      const gameAudioStat = dayStat![game];
      gameAudioStat.words = Array.from(
        new Set(gameAudioStat.words.concat(data.words))
      );
      gameAudioStat.right += data.right;
      gameAudioStat.wrong += data.wrong;
      gameAudioStat.series =
        gameAudioStat.series < data.series ? data.series : gameAudioStat.series;

      this.writeStat(stat);
    } catch (error) {
      this.createZeroStat();
      this.updateGameStat(game, data);
    }
  }

  async getStat(): Promise<UserStat> {
    const { userId, token } = this.getSetting('auth');

    const rawResponse = await fetch(
      `${this.domain}/users/${userId}/statistics`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      }
    );

    if (rawResponse.status === 404) {
      this.createZeroStat();
      return this.getStat();
    }

    const stat = await rawResponse.json();

    // распаковывает статистику в массив из строки
    const arrayDates = await JSON.parse(stat.optional.data);
    const result: UserStat = Object.assign(stat, {
      optional: { data: arrayDates },
    });

    // если есть статистика других дней, то создаём новый день
    const dateNow = this.getStringDate();
    const dayStat = result.optional.data.find((elem) => elem.date === dateNow);
    if (!dayStat) {
      const dataStat = result.optional.data;
      dataStat.push(await this.createDayZeroStat());
    }
    return result;
  }

  // eslint-disable-next-line consistent-return
  async countStat() {
    try {
      const stat = await this.getStat();
      const date = this.getStringDate();
      const dayStat = stat.optional.data.find((elem) => elem.date === date);

      const audioGame = dayStat!.audioGame.words;
      const sprintGame = dayStat!.sprintGame.words;

      const words = Array.from(new Set([...sprintGame, ...audioGame]));

      dayStat!.words.words = words.length;

      stat.learnedWords = stat.optional.data.reduce(
        (prev, curr) => prev + curr.words.easyQty,
        0
      );

      this.writeStat(stat);
      return stat;
    } catch (error) {
      // console.log(error);
    }
  }

  private async writeStat(data: UserStat) {
    const { userId, token } = this.getSetting('auth');

    const stat = { ...data };

    // @ts-ignore
    stat.optional.data = JSON.stringify(data.optional.data);
    // @ts-ignore
    delete stat.id;

    const response = await fetch(`${this.domain}/users/${userId}/statistics`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stat),
    });

    const content = await response.json();

    return content;
  }

  private async createZeroStat() {
    const data = {
      learnedWords: 0,
      optional: {
        data: [await this.createDayZeroStat()],
      },
    };

    return this.writeStat(data);
  }

  private async createDayZeroStat() {
    const date = this.getStringDate();

    return {
      date,
      words: { words: 0, easyQty: 0 },
      audioGame: { words: [], right: 0, wrong: 0, series: 0 },
      sprintGame: { words: [], right: 0, wrong: 0, series: 0 },
    };
  }

  private async plusOneIntoEasyStat() {
    const stat = await this.getStat();

    const date = this.getStringDate();
    const dayStat = stat.optional.data.find((elem) => elem.date === date);

    dayStat!.words.easyQty += 1;

    this.writeStat(stat);
  }
  // === Работа со словами при авторизации === //

  async getTwentyUserWordsWithoutEasy(
    group: string,
    page: number
  ): Promise<IWord[]> {
    const result: IWord[] = [];
    const wordsPage = await this.getTwentyUserWords(group, page);
    const wordsPageNotEasy = wordsPage.filter(
      (word) => !word.userWord?.optional.easy
    );
    result.push(...wordsPageNotEasy);

    let currentPage = 0;
    const lastPage = 29;
    while (result.length < 20) {
      if (currentPage === lastPage + 1) currentPage = 0;

      // eslint-disable-next-line no-await-in-loop
      const words = await this.getTwentyUserWords(group, currentPage);
      const wordsNotEasy = words.filter(
        (word) => !word.userWord?.optional.easy
      );
      result.push(...wordsNotEasy);
      currentPage += 1;
    }

    return result.slice(0, 20);
  }

  async wrongWord(iWord: IWord) {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { id, word } = iWord;

    try {
      const userWord = await this.getUserWord(String(id));
      if (userWord.optional.easy) this.deleteUserWord(String(id));
    } catch (error) {
      await this.createUserWord(String(id), word);
    }
  }

  async rightWord(iWord: IWord) {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { id, word } = iWord;

    try {
      const userWord = await this.getUserWord(String(id));
      const { answers, difficulty, easy } = userWord.optional;
      const newAnswers = Number(answers) + 1;
      if (easy) {
        return;
      }
      if (difficulty) {
        const correctAnswersToMoveWord = 5;
        if (newAnswers === correctAnswersToMoveWord) {
          await this.setWordEasy(String(id), word);
        } else
          this.updateUserWord(
            String(id),
            word,
            difficulty,
            easy,
            String(newAnswers)
          );
      }
      if (!easy && !difficulty) {
        const correctAnswersToMoveWord = 3;
        if (newAnswers === correctAnswersToMoveWord) {
          await this.setWordEasy(String(id), word);
        } else
          this.updateUserWord(
            String(id),
            word,
            difficulty,
            easy,
            String(newAnswers)
          );
      }
    } catch (error) {
      await this.createUserWord(String(id), word);
      await this.rightWord(iWord);
    }
  }

  async getUserWord(wordId: string) {
    try {
      const { userId, token } = this.getSetting('auth');

      const response = await fetch(
        `${this.domain}/users/${userId}/words/${wordId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      return await response.json();
    } catch (error) {
      // console.log(error);
      return null;
    }
  }

  async getAllDifficultWords(page: number): Promise<IWord[]> {
    const userWords = await this.getAllUserWords();
    const filtered = userWords.filter((elem) => elem.optional.difficulty);
    const wordIdList = filtered.map((elem) => elem.wordId);

    const promiseArray: Promise<IWord>[] = [];
    wordIdList.forEach((wordId) =>
      promiseArray.push(this.getWord(String(wordId)))
    );
    const commonWords = await Promise.all(promiseArray);
    const result = commonWords.map((elem, index) =>
      Object.assign(elem, { userWord: filtered[index] })
    );

    const ZeroCountCompensation = 1;
    const wordsOnPage = 20;

    const words = result.splice(
      wordsOnPage * (page + ZeroCountCompensation - 1),
      wordsOnPage * (page + ZeroCountCompensation)
    );

    return words;
  }

  async getCountAllDifficultWords(): Promise<number> {
    const userWords = await this.getAllUserWords();
    const filtered = userWords.filter((elem) => elem.optional.difficulty);

    const ZeroCountCompensation = 1;
    const wordsOnPage = 20;
    return Math.floor(
      Number(Number(filtered.length) / (wordsOnPage + ZeroCountCompensation))
    );
  }

  async setWordDifficult(wordId: string, word: string): Promise<void> {
    try {
      await this.updateUserWord(wordId, word, true, false);
    } catch {
      await this.createUserWord(wordId, word);
      await this.updateUserWord(wordId, word, true, false);
    }
  }

  async setWordEasy(wordId: string, word: string): Promise<void> {
    try {
      await this.plusOneIntoEasyStat();
      await this.updateUserWord(wordId, word, false, true);
    } catch {
      await this.createUserWord(wordId, word);
      await this.updateUserWord(wordId, word, false, true);
    }
  }

  async getTwentyUserWords(group: string, page: number): Promise<IWord[]> {
    const words: IWord[] = await this.getWords(group, page);
    const wordId = words.map((word) => word.id);
    const promiseArray = wordId.map((id) => this.getUserWord(String(id)));
    const userWords: UserWord[] = await Promise.all(promiseArray);
    const result = words.map((word, index) =>
      Object.assign(word, { userWord: userWords[index] })
    );
    return result;
  }

  async deleteUserWord(wordId: string) {
    const { userId, token } = this.getSetting('auth');

    const response = await fetch(
      `${this.domain}/users/${userId}/words/${wordId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.json();
  }

  async createUserWord(wordId: string, word: string): Promise<void> {
    const { userId, token } = this.getSetting('auth');
    const data = {
      difficulty: word,
      optional: {
        answers: '0',
        difficulty: false,
        easy: false,
      },
    };
    const response = await fetch(
      `${this.domain}/users/${userId}/words/${wordId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    );

    return response.json();
  }

  private async updateUserWord(
    wordId: string,
    word: string,
    difficulty: boolean,
    easy: boolean,
    answers = '0'
  ): Promise<UserWord> {
    const { userId, token } = this.getSetting('auth');

    const data: UserWord = {
      difficulty: word,
      optional: {
        answers,
        difficulty,
        easy,
      },
    };

    const response = await fetch(
      `${this.domain}/users/${userId}/words/${wordId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    );

    const content = await response.json();
    return content;
  }

  private async getAllUserWords(): Promise<UserWord[]> {
    const { userId, token } = this.getSetting('auth');

    const rawResponse = await fetch(`${this.domain}/users/${userId}/words/`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    const content = await rawResponse.json();
    return content;
  }

  // === Работа с User === //

  // eslint-disable-next-line class-methods-use-this
  public logout(): void {
    const logoutBtn = document.getElementById(
      'logout-btn'
    ) as HTMLButtonElement;
    if (logoutBtn) {
      logoutBtn.onclick = () => {
        localStorage.clear();
        STATE.auth = JSON.parse(localStorage.getItem('rslang-localStorage')!);
        STATE.userName = JSON.parse(
          localStorage.getItem('rslang-localStorage')!
        );
        AppView.clear();
        const auth = new AuthController(new AuthView(), new AuthModel());
        auth.displayPage();
        renderHeaderTemplate();
      };
    }
  }

  isUser(): boolean {
    try {
      return 'name' in this.getSetting('auth');
    } catch (error) {
      return false;
    }
  }

  // === Работа со словами без авторизации === //

  async getWords(group: string, page: number): Promise<IWord[]> {
    return (
      await fetch(`${this.domain}/words?group=${group}&page=${page}`, {
        method: 'GET',
      })
    ).json();
  }

  async getWord(wordId: string): Promise<IWord> {
    return (
      await fetch(`${this.domain}/words/${wordId}`, {
        method: 'GET',
      })
    ).json();
  }

  getDomain(): string {
    return this.domain;
  }

  // === Работа с localStorage === //

  getSetting(key: string) {
    const setting = this.downloadSetting();
    if (setting) return setting[key];
    return null;
  }

  addSetting(data: {}): void {
    const setting = this.downloadSetting();
    if (setting) this.saveSetting(Object.assign(setting, data));
    else this.saveSetting(data);
  }

  // eslint-disable-next-line class-methods-use-this
  private downloadSetting() {
    const setting = localStorage.getItem('rslang-localStorage');
    return JSON.parse(String(setting));
  }

  // eslint-disable-next-line class-methods-use-this
  private saveSetting(setting: {}) {
    localStorage.setItem('rslang-localStorage', JSON.stringify(setting));
  }
}

export default AppModel;
export { emojiList, UserWord, UserStat, StatDate };
