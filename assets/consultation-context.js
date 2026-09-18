/** Presentation only: consultation-form.js owns selection, validation and attribution. */
(function(){
  'use strict';

  function init(){
    var root = document.getElementById('consult-form-root');
    if (!root) return;
    var params = new URLSearchParams(location.search);
    var type = params.get('type');
    var residentialTitle = document.title;
    var consent = ' 개인정보 수집·이용 동의는 별도 필수입니다.';
    var followUp = ' 담당자가 확인 후 상담 일정을 안내합니다.';

    function text(key, value){
      var node = document.querySelector('[data-consultation-context="' + key + '"]');
      if (node) node.textContent = value;
    }

    function meta(key, value){
      var node = document.querySelector('[data-consultation-context="' + key + '"]');
      if (node) node.setAttribute('content', value);
    }

    function render(vertical){
      var label, heading, help, note, footer, title, cta;
      if (type === 'residential') {
        label = '주거 인테리어 상담';
        heading = ['우리 집 조건부터,', '함께 확인합니다'];
        help = '기본 필수 정보 4가지(성함, 연락처, 주소, 평형)를 작성해주세요.' + consent + followUp;
        note = '아직 정하지 못한 내용은 상담하며 함께 정해도 됩니다. 신청만으로 계약이 진행되지 않습니다.';
        footer = '부산 주거 인테리어';
        title = residentialTitle;
        cta = '필수 정보부터 작성';
      } else if (type === 'commercial') {
        var space = vertical === 'shop' ? '상가' : vertical === 'office' ? '사무실' : '상업공간';
        var schedule = vertical === 'shop' ? '오픈 희망일' : vertical === 'office' ? '입주 희망일' : '오픈·입주 희망일';
        label = space + ' 인테리어 상담';
        heading = [vertical === 'shop' ? '상가 오픈 준비부터,' : vertical === 'office' ? '사무실 입주 준비부터,' : '상업공간 조건부터,', '함께 확인합니다'];
        help = '기본 필수 정보 9가지(성명, 연락처, 업종·공간 유형, 현장 지역·주소, 전용면적, 현재 현장 상태, ' + schedule + ', 예산 구간, 연락 가능한 시간)를 작성해주세요.' + consent + followUp;
        note = '예산은 미정으로 선택할 수 있고, 추가 요청사항은 선택 입력입니다. 신청만으로 계약이 진행되지 않습니다.';
        footer = '부산 ' + space + ' 인테리어';
        title = '부산 ' + space + ' 인테리어 상담 신청 | 공간보감';
        cta = '필수 정보부터 작성';
      } else {
        label = '인테리어 상담';
        heading = ['어떤 공간을 상담하시나요?', '유형부터 선택해주세요'];
        help = '주거 또는 상업공간을 선택하면 해당 상담 신청서가 표시됩니다. 주거는 기본 필수 정보 4가지, 상업공간은 9가지를 작성합니다.' + consent;
        note = '공간 유형을 선택한 뒤 필요한 정보를 확인해주세요. 신청만으로 계약이 진행되지 않습니다.';
        footer = '부산 인테리어';
        title = '부산 인테리어 상담 신청 | 공간보감';
        cta = '상담 유형 선택';
      }
      text('label', label);
      var h1 = document.querySelector('[data-consultation-context="heading"]');
      if (h1) {
        h1.textContent = heading[0];
        h1.appendChild(document.createElement('br'));
        h1.appendChild(document.createTextNode(heading[1]));
      }
      text('help', help);
      text('note', note);
      text('footer', footer);
      text('cta', cta);
      document.title = title;
      meta('description', label + '. ' + help);
      meta('og-title', title);
      meta('og-description', label + '. ' + help);
    }

    // URL selection follows the existing form's exact type contract; vertical never infers type.
    render(params.get('vertical'));
    if (type === 'commercial') {
      // The form creates this named select later. Listen without changing any field or URL.
      root.addEventListener('change', function(event){
        if (event.target && event.target.name === 'qvertical') render(event.target.value);
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
