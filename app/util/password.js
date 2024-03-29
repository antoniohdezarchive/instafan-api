const bcrypt = require('bcrypt');
const response = require('./response');

exports.hashPassword = function(password) {
    const saltRounds = 10;
    const salt = bcrypt.genSaltSync(saltRounds);
    return bcrypt.hashSync(password, salt);
}

exports.validatePassword = function(password, req, res) {
    if (req.body.password.length < 8) {
        response.returnCustomError(res, 401, {key: 'password', name: 'ValidatorError', message: 'Invalid password', value: req.body.password})
        throw 'Invalid password';
    }

    return true;
}