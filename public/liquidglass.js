/**
 * liquidglass.js
 * Pure CSS + JS tilt — Apple-style glass for .brand and .role-switch.
 *
 * liquidGL (WebGL) was removed because it relies on an html2canvas DOM snapshot
 * as its background texture. CSS keyframe animations (orbs with filter:blur)
 * are NOT captured by html2canvas, causing "weird" refraction artefacts.
 *
 * backdrop-filter is a live GPU composite operation — CSS-animated orbs
 * show through correctly without any snapshot.
 */

function addGlassTilt(el, factor) {
  el.addEventListener('mousemove', function (e) {
    var r = el.getBoundingClientRect();
    var x = (e.clientX - r.left - r.width / 2) / (r.width / 2);
    var y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    el.style.transform =
      'perspective(800px) rotateX(' + (-y * factor) + 'deg) rotateY(' + (x * factor) + 'deg) scale(1.015)';
  });
  el.addEventListener('mouseleave', function () {
    el.style.transform = '';
  });
}

var brand = document.querySelector('.brand');
var roleSwitch = document.querySelector('.role-switch');

if (brand) addGlassTilt(brand, 6);
if (roleSwitch) addGlassTilt(roleSwitch, 3);

// sentinel — remove after confirming glass looks good
console.log('[liquidglass] CSS glass + JS tilt active on .brand and .role-switch');
