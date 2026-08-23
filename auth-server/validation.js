const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}][\p{L}\p{M} .'-]*$/u;

function calculateAge(birthDate) {
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

function validateProfile(body) {
  const errors = {};
  const s = (v) => String(v || '').trim();

  const firstName = s(body.first_name);
  const lastName = s(body.last_name);
  if (!firstName || firstName.length < 2 || firstName.length > 60 || !NAME_RE.test(firstName)) {
    errors.first_name = 'Nombre inválido (mínimo 2 letras).';
  }
  if (!lastName || lastName.length < 2 || lastName.length > 60 || !NAME_RE.test(lastName)) {
    errors.last_name = 'Apellidos inválidos (mínimo 2 letras).';
  }

  const personalEmail = s(body.personal_email).toLowerCase();
  const eduEmail = s(body.edu_email).toLowerCase();
  if (!EMAIL_RE.test(personalEmail)) errors.personal_email = 'Correo personal no válido.';
  if (!EMAIL_RE.test(eduEmail)) errors.edu_email = 'Correo educativo no válido.';

  const phone = s(body.phone).replace(/[^\d+]/g, '');
  if (phone.length < 7 || phone.length > 20) errors.phone = 'Teléfono no válido (mínimo 7 dígitos).';

  const address = s(body.address);
  if (address.length < 5) errors.address = 'Dirección requerida.';

  const city = s(body.city);
  const state = s(body.state);
  const country = s(body.country);
  if (city.length < 2) errors.city = 'Ciudad requerida.';
  if (state.length < 2) errors.state = 'Departamento/Estado requerido.';
  if (country.length < 2) errors.country = 'País requerido.';

  const birthDate = s(body.birth_date);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) {
    errors.birth_date = 'Fecha de nacimiento inválida (AAAA-MM-DD).';
  } else {
    const parsed = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const invalid = (
      parsed.getFullYear() !== Number(m[1]) ||
      parsed.getMonth() !== Number(m[2]) - 1 ||
      parsed.getDate() !== Number(m[3])
    );
    if (invalid) {
      errors.birth_date = 'Fecha de nacimiento inválida (AAAA-MM-DD).';
    } else {
      const age = calculateAge(parsed);
      if (Number.isNaN(age) || age < 13) errors.birth_date = 'Debes tener al menos 13 años.';
      else if (age > 120) errors.birth_date = 'Fecha de nacimiento inválida.';
    }
  }

  const interests = Array.isArray(body.interests) ? body.interests : [];
  if (interests.length < 3) {
    errors.interests = 'Responde al menos 3 preguntas de interés.';
  } else {
    const valid = interests.every(
      (it) =>
        it &&
        typeof it.q === 'string' &&
        it.q.trim().length > 0 &&
        (typeof it.a === 'string'
          ? it.a.trim().length > 0
          : Array.isArray(it.a) && it.a.length > 0)
    );
    if (!valid) errors.interests = 'Las respuestas de interés son inválidas.';
  }

  if (Object.keys(errors).length > 0) return { errors, profile: null };

  return {
    errors: {},
    profile: {
      first_name: firstName,
      last_name: lastName,
      personal_email: personalEmail,
      edu_email: eduEmail,
      phone,
      address,
      city,
      state,
      country,
      birth_date: birthDate,
      interests,
    },
  };
}

module.exports = { validateProfile, EMAIL_RE, calculateAge };
