const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'consultation-form.js'), 'utf8');

class Node {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  querySelector(selector) {
    return selector === 'textarea' ? this.textarea : selector === '.cf-label' ? this.label : null;
  }
}

function optionalFieldsHarness() {
  const start = source.indexOf('function buildOptionalFields(optional)');
  const end = source.indexOf('function renderForm()', start);
  assert.notEqual(start, -1, 'buildOptionalFields not found');
  assert.notEqual(end, -1, 'renderForm not found');

  const built = [];
  const context = {
    leadType: 'residential',
    document: { createElement: (tag) => new Node(tag) },
    element(tag, className, text) {
      const node = new Node(tag);
      node.className = className || '';
      if (text != null) node.textContent = text;
      return node;
    },
    buildField(question) {
      built.push(question);
      const node = new Node('field');
      node.question = question;
      node.textarea = {};
      node.label = {};
      return node;
    },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { build: context.buildOptionalFields, built };
}

function fieldsWithin(node) {
  const fields = [];
  for (const child of node.children) {
    if (child.question) fields.push(child.question);
    fields.push(...fieldsWithin(child));
  }
  return fields;
}

test('추천 선택 항목은 우선순위대로 보이고 나머지는 원래 순서로 접힌다', () => {
  // Given
  const optional = [
    { id: 1, question: '현장 특징', questionType: 'text', isRequired: false },
    { id: 2, question: '예산 범위', questionType: 'select', isRequired: false },
    { id: 3, question: '공사 시작 희망일', questionType: 'date', isRequired: false },
    { id: 4, question: '요청사항', questionType: 'text', isRequired: false },
    { id: 5, question: '추가 예산', questionType: 'select', isRequired: false },
    { id: 6, question: '시공 완료 희망일', questionType: 'date', isRequired: false },
    { id: 7, question: '추가 요청사항', questionType: 'text', isRequired: false },
    { id: 8, question: '시공장소를 모두 선택해 주세요.', questionType: 'multiple_choice', isRequired: false },
    { id: 9, question: '선호하는 인테리어 스타일을 선택해주세요', questionType: 'multiple_choice', isRequired: false },
  ];
  const snapshot = structuredClone(optional);
  const harness = optionalFieldsHarness();

  // When
  const result = harness.build(optional);

  // Then
  assert.equal(result.tagName, 'DIV');
  const details = result.children.find((child) => child.tagName === 'DETAILS');
  assert.ok(details, '남은 선택 항목은 details 안에 있어야 한다');
  assert.equal(Boolean(details.open), false);
  assert.deepEqual(
    fieldsWithin(result).filter((question) => !fieldsWithin(details).includes(question)).map((question) => question.id),
    [2, 8, 9, 3, 4],
  );
  assert.deepEqual(fieldsWithin(details).map((question) => question.id), [1, 5, 6, 7]);
  assert.deepEqual(harness.built.map((question) => question.id).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(harness.built.every((question) => optional.includes(question)));
  assert.deepEqual(optional, snapshot);
});

test('요청사항 하나만 있으면 바로 보이고 빈 접힘 영역은 만들지 않는다', () => {
  // Given
  const requestNote = { id: 20, question: '요청사항', questionType: 'text', isRequired: false };
  const harness = optionalFieldsHarness();

  // When
  const result = harness.build([requestNote]);

  // Then
  assert.deepEqual(fieldsWithin(result), [requestNote]);
  assert.equal(result.children.some((child) => child.tagName === 'DETAILS'), false);
  assert.deepEqual(harness.built, [requestNote]);
  assert.equal(requestNote.isRequired, false);
});
