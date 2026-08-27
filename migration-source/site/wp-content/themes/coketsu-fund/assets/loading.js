// jQuery(function () {
  var stroke;
  stroke = new Vivus('mask', {
    start: 'manual',
    type: 'scenario-sync',
    duration: 7,
    forceRender: false,
    animTimingFunction:Vivus.EASE,
  },
  function () {
    jQuery('#mask').attr("class", "done");
  }
  )

  jQuery(window).on('load', function () {
    jQuery("#splash-logo").delay(2200).fadeOut('slow');
    jQuery("#splash").delay(2500).fadeOut('slow', function () {
      $('body').addClass('appear');
    });
    stroke.play();
  });

// });
