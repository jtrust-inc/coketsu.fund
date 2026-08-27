document.addEventListener('DOMContentLoaded', function() {
  // よくある質問のリンクを取得
  const faqItems = document.querySelectorAll('.faq-link');
  // ベースURLを取得
  const baseUrl = window.location.origin + '/';
  // 各faq-linkのa要素のリンクを修正
  faqItems.forEach(function(faqItem) {
    faqItem.querySelector('a').href = baseUrl + '#faq';
  });
});
