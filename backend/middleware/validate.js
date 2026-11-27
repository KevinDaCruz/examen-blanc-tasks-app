/**
 * @file Middleware générique de validation Joi.
 * @module middleware/validate
 */

/**
 * Crée un middleware qui valide `req[source]` avec un schéma Joi.
 * En cas d'erreur, répond 400 avec le premier message lisible ; sinon remplace
 * `req[source]` par la valeur nettoyée (trim, conversion de types, champs inconnus rejetés).
 *
 * @param {Joi.ObjectSchema} schema - Schéma Joi à appliquer.
 * @param {'body'|'params'} [source='body'] - Partie de la requête à valider.
 * @returns {express.RequestHandler}
 * @example router.post('/', validate(schemas.createTask), handler);
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { value, error } = schema.validate(req[source] ?? {}, {
      abortEarly: true,
      stripUnknown: false,
      errors: { wrap: { label: false } },
    });
    if (error) {
      return res.status(400).json({ msg: error.details[0].message });
    }
    if (source === 'body') req.body = value;
    else req.validatedParams = value;
    return next();
  };
}

module.exports = validate;
