// Progressive enhancement: mostra/nasconde i campi orario andata/ritorno in
// base al tipo di transfer scelto. Senza JavaScript il form funziona
// comunque (tutti i campi restano visibili), quindi non è indispensabile.
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('form.add-form').forEach(function (form) {
    var radios = form.querySelectorAll('input[type="radio"]');
    var andataField = form.querySelector('.andata-field');
    var ritornoField = form.querySelector('.ritorno-field');

    function update() {
      var checked = form.querySelector('input[type="radio"]:checked');
      if (!checked) return;
      var type = checked.value;
      if (andataField) andataField.style.display = type === 'SOLO_RITORNO' ? 'none' : 'block';
      if (ritornoField) ritornoField.style.display = type === 'SOLO_ANDATA' ? 'none' : 'block';
    }

    radios.forEach(function (r) {
      r.addEventListener('change', update);
    });
    update();
  });
});
