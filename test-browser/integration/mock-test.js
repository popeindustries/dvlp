/* global cy, expect */

context('Mock', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should work', async () => {
    cy.request('https://localhost:8000/foo').should((res) => {
      expect(res.status).to.equal(200);
      expect(res.body).to.eql({ name: 'foo' });
    });
  });
});
