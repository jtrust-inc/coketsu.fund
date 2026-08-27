// FAQ（よくある質問）のアコーディオン。functions.phpから呼び出し
jQuery(function () {
  if (jQuery('.vk_faq').length) {
    jQuery('.vk_faq_content').hide();
    jQuery('.vk_faq_title').click(function () {
      if (!jQuery(this).hasClass('is-active')) {
        jQuery(this).next().show();
        jQuery(this).addClass('is-active');
      } else {
        jQuery(this).next().hide();
        jQuery(this).removeClass('is-active');
      }
    });
  }
});




