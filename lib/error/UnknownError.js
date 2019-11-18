module.exports = class UnknownError extends Error {

  constructor() {
    super('unknown_error');

    this.statusCode = 500;
    this.body = { code: this.message };
  }

};
