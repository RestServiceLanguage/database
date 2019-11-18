module.exports = class ConstraintError extends Error {

  constructor(field) {
    super('constraint_violation');

    this.statusCode = 400;
    this.body = { code: this.message, field };
  }

};
