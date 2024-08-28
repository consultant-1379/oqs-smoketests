var fs = require('fs'),
  should = require('should'),
  test = require('selenium-webdriver/testing'),
  webdriver = require('selenium-webdriver'),
  request = require('request-promise'),
  By = webdriver.By,
  driver,
  baseUrl = `http://${process.env.BASE_URL}/`,
  testUsername = process.env.TEST_USERNAME,
  testPassword = process.env.TEST_PASSWORD,
  loginUrl = `${baseUrl}authentication/signin`,
  chromeCapabilities = webdriver.Capabilities.chrome(),
  chromeOptions = {
    args: ['--no-sandbox', '--start-fullscreen', '--start-maximized', '--window-size=1920, 1080'],
    prefs: {
      'download.default_directory': '/opt/SmokeTest/'
    }
  },
  MAX_RETRIES = 0,
  testErrorNumber = 0;

chromeCapabilities.set('chromeOptions', chromeOptions);
const until = webdriver.until;

async function oqsSignInREST(username, password) {
  try {
    response = await request.post(`${baseUrl}api/auth/signin`).form({ username: username, password: password });
    response = JSON.parse(response);
    return response;
  } catch (requestErr) {
    throw new Error(`Failed to sign-in for username ${username}. Received message with status ${requestErr.message}`);
  }
}

async function createDeploymentREST(deplName, associatedPod, product) {
  var deploymentJSON = { name: deplName, associatedPod: associatedPod, product: product };
  try {
    response = await request.post(`${baseUrl}/api/deployments`).auth(testUsername, testPassword).form(deploymentJSON);
    response = JSON.parse(response);
    return response;
  } catch (requestErr) {
    throw new Error(`Failed to create Deployment artifact. Received message with status ${requestErr.message}`);
  }
}

async function deleteDeploymentREST(deploymentId) {
  try {
    await request.delete(`${baseUrl}api/deployments/${deploymentId}`).auth(testUsername, testPassword);
  } catch (delErr) {
    throw new Error(`Failed to delete Deployment artifact. Received message with status ${delErr.message}`);
  }
}

async function takeScreenshot(name) {
  testErrorNumber += 1;
  var screenshotData = await driver.takeScreenshot();
  var base64Data = screenshotData.replace(/^data:image\/png;base64,/, '');
  fs.writeFile(`images/${testErrorNumber}_${name}.png`, base64Data, 'base64', function () { });
}

async function newAdminSetup(signum, role) {
  await driver.get(`${baseUrl}users/create`);
  await driver.wait(until.elementLocated(By.xpath('//h1[contains(.,"Creating")]')), 5000);
  await driver.findElement(By.id('name')).sendKeys(signum);
  await driver.findElement(By.id(role)).click();
  await driver.findElement(By.id("Save")).click();
  await driver.wait(until.elementLocated(By.xpath('//h1[contains(.,"Admin")]')), 5000);
}

async function newPodSetup(podName, loadTolerance, queueEnabled, queueProduct) {
  await driver.get(`${baseUrl}pods/create`);
  await driver.wait(until.elementLocated(By.id('name')), 5000);
  await driver.findElement(By.id('name')).sendKeys(podName);
  await driver.findElement(By.id('podLoadTolerance')).sendKeys(loadTolerance);
  await driver.findElement(By.id('queueEnabled')).click();
  await driver.findElement(By.xpath(`//option[contains(.,"${(queueEnabled) ? 'Enabled' : 'Disabled'}")]`)).click();
  await driver.findElement(By.xpath('//body')).click();
  await driver.findElement(By.id(queueProduct)).click();
  await clickElement(By.xpath('//button[contains(.,"Save")]', false));
  await driver.sleep(1000);
}

async function getRowXPathFromTable(tableUrl, name, tableId = false) {
  var rowXPath = '';
  await driver.get(baseUrl + tableUrl);
  await driver.wait(until.elementLocated(By.xpath(`//td[contains(.,"${name}")]`)), 10000);
  var baseTableRowXPath = '/html/body/section/section/section/ui-view/section/table/tbody/';
  if (tableId) baseTableRowXPath = `//*[@id="${tableId}"]/tbody/`;
  try {
    var i = 1;
    for (; ;) {
      var nameXPath = 'td[1]';
      var rowIndexXPath = `tr[${i}]/`;
      rowXPath = baseTableRowXPath + rowIndexXPath;
      var itemNameXPath = rowXPath + nameXPath;
      // eslint-disable-next-line no-await-in-loop
      var foundName = await driver.findElement(By.xpath(itemNameXPath)).getText();
      if (foundName === name) {
        break;
      }
      i += 1;
    }
  } catch (err) {
    // do nothing finishes with error when checking a table
  }
  return rowXPath;
}

async function performActionOnTableForObject(objType, objUrl, objName, actionType, tableId) {
  var objectRowXPath = await getRowXPathFromTable(objUrl, objName, tableId);
  var buttonPath = getActionButtonPath(objType, actionType);
  await clickElement(By.xpath(objectRowXPath + buttonPath), actionType);
}

async function clickElement(keyValue, actionType) {
  await driver.wait(until.elementLocated(keyValue), 10000);
  var element = await driver.findElement(keyValue);
  await driver.executeScript('arguments[0].click()', element);
  await driver.sleep(1000);
  if (actionType === 'Delete' || actionType === 'Remove') await driver.switchTo().alert().accept();
  await driver.sleep(1000);
}

function getActionButtonPath(objName, buttonName) {
  var path = '';
  switch (objName) {
    case 'pods':
      path += 'td[4]';
      switch (buttonName) {
        case 'View':
          path += '/a[1]';
          break;
        case 'Edit':
          path += '/a[2]';
          break;
        case 'Delete':
          path += '/a[3]';
          break;
      };
      break;
    case 'admins':
      switch (buttonName) {
        case 'Remove':
          path += '/a';
          break;
      }
      break;
    case 'configurations':
      switch (buttonName) {
        case 'View':
          path += '/a[1]';
          break;
        case 'Edit':
          path += '/a[2]';
          break;
      }
      break;
    case 'deployments':
      path += 'td[8]';
      switch (buttonName) {
        case 'Edit':
          path += '/a[1]';
          break;
        case 'Delete':
          path += '/a[1]';
          break;
      }
      break;
    default:
    // do nothing
  }
  return path;
}

async function verifyDeploymentInTable(podName, deploymentName, tableType) {
  await performActionOnTableForObject('pods', 'pods/list', podName, 'View', 'enabled-table');
  var podId = await getIdFromCurrentURL();
  var xPath = await getRowXPathFromTable(`pods/view/${podId}`, deploymentName, tableType);
  var deplNameFound = await driver.findElement(By.xpath(`${xPath}td[1]`)).getText();
  deplNameFound.should.equal(deploymentName);
}
async function getIdFromCurrentURL() {
  var currentURL = await driver.executeScript("return document.URL");
  var currentURLSplit = currentURL.split('/');
  return currentURLSplit[currentURLSplit.length - 1];
}
async function changeDeploymentStatus(deplName, status, tableType) {
  var podId = await getIdFromCurrentURL();
  // click Edit Status
  await performActionOnTableForObject('deployments', `pods/view/${podId}`, deplName, 'Edit', `${tableType}-deployments`);
  await driver.sleep(1000);
  // click status
  await driver.findElement(By.xpath(`//option[contains(.,"${status}")]`)).click();
  await driver.findElement(By.xpath('//body')).click();
  await clickElement(By.xpath('//button[contains(.,"Save")]', false));
  await driver.sleep(1000);
  await driver.findElement(By.xpath('//body')).click();
}
describe('Openstack Queuing Solution Smoketests', function () {
  before(async function () {
    this.timeout(50000);
    this.retries(MAX_RETRIES);
    try {
      driver = await new webdriver.Builder()
        .forBrowser('chrome')
        .withCapabilities(chromeCapabilities)
        .build();
      // Get OQS Admin Information from API
      oqsAdminInformation = await oqsSignInREST(testUsername, testPassword);

      // Log in test user first
      console.log(`Navigating to login address: ${loginUrl}`); // eslint-disable-line no-console
      await driver.get(loginUrl);
      await driver.wait(until.elementLocated(By.name('username')), 30000);
      await driver.findElement(By.name('username')).sendKeys(testUsername);
      await driver.findElement(By.name('password')).sendKeys(testPassword);
      await driver.findElement(By.css('[class="ebBtn eaLogin-formButton"]')).click();
      await driver.wait(until.elementLocated(By.xpath('//h1[contains(.,"Welcome")]')), 30000);
      console.log('Login complete.'); // eslint-disable-line no-console
    } catch (beforeAllError) {
      await takeScreenshot('before_initial');
      throw beforeAllError;
    }
  });

  after(function () {
    return driver.quit();
  });

  describe('Headers', async function () {
    this.timeout(15000);
    it('Should get header of Pods Historical Logs page ', async function () {
      await driver.get(`${baseUrl}logs/pods/list`);
      await driver.wait(until.elementLocated(By.className('page-header')), 30000);
      (await driver.findElement(By.xpath('//h1[contains(.,"Pods Historical Logs")]')).isDisplayed()).should.equal(true);
    });

    it('Should get header of Deployments Historical Logs page ', async function () {
      await driver.get(`${baseUrl}logs/deployments/list`);
      await driver.wait(until.elementLocated(By.className('page-header')), 30000);
      (await driver.findElement(By.xpath('//h1[contains(.,"Deployments Historical Logs")]')).isDisplayed()).should.equal(true);
    });

    it('should get header of Admins page', async function () {
      await driver.get(`${baseUrl}users/list`);
      await driver.wait(until.elementLocated(By.className('page-header')), 30000);
      (await driver.findElement(By.xpath('//h1[contains(.,"Admins")]')).isDisplayed()).should.equal(true);
    });

    it('should get header of Pods page', async function () {
      await driver.get(`${baseUrl}pods/list`);
      await driver.wait(until.elementLocated(By.className('page-header')), 30000);
      (await driver.findElement(By.xpath('//h1[contains(.,"Multi-Tenant Pods List")]')).isDisplayed()).should.equal(true);
    });

    it('should get header of Configurations page', async function () {
      await driver.get(`${baseUrl}configurations/list`);
      await driver.wait(until.elementLocated(By.className('page-header')), 30000);
      (await driver.findElement(By.xpath('//h1[contains(.,"Configurations")]')).isDisplayed()).should.equal(true);
    });
  });

  describe('Create', async function () {
    this.timeout(30000);
    this.retries(MAX_RETRIES);
    describe('Admin', async function () {
      it('should create superAdmin and see it in Admins list', async function () {
        var signum = 'eistpav';
        var role = "superAdmin";
        // New Admin
        await newAdminSetup(signum, role);
        // Verify in table
        await driver.wait(until.elementLocated(By.xpath(`//td[contains(.,"${signum}")]`)), 10000);
      });

      it('should not create superAdmin if username/signum not in the database', async function () {
        var signum = 'notInDB';
        var objType = 'users/list';
        var role = 'superAdmin';
        // Try creating new Admin
        await driver.get(baseUrl + objType);
        await driver.wait(until.elementLocated(By.id('users-table')), 30000);
        await driver.findElement(By.css('[ui-sref="users.create"]')).click();
        await driver.wait(until.elementLocated(By.xpath('//h1[contains(.,"Creating")]')), 5000);
        await driver.findElement(By.id('name')).sendKeys(signum);
        await driver.findElement(By.id(role)).click();
        await driver.findElement(By.id('Save')).click();
        await driver.wait(until.elementLocated(By.className('ui-notification')), 5000);
        // Verify error message
        (await driver.findElement(By.xpath('//div[contains(.,"Username not in database. User must have logged in once before they can be added as an admin.")]')).isDisplayed()).should.equal(true);
      });

      it('should not update the role of Logged In User', async function () {
        var objType = 'users/list';
        var role = 'admin';
        // Try creating new Admin
        await driver.get(baseUrl + objType);
        await driver.wait(until.elementLocated(By.id('users-table')), 30000);
        await driver.findElement(By.css('[ui-sref="users.create"]')).click();
        await driver.wait(until.elementLocated(By.xpath('//h1[contains(.,"Creating")]')), 5000);
        await driver.findElement(By.id('name')).sendKeys(testUsername);
        await driver.findElement(By.id(role)).click();
        await driver.findElement(By.id('Save')).click();
        await driver.wait(until.elementLocated(By.className('ui-notification')), 5000);
        // Verify error message
        (await driver.findElement(By.xpath('//div[contains(.,"Role Update of Current User Not Allowed!")]')).isDisplayed()).should.equal(true);
      });
    });

    describe('Pods', async function () {
      it('should create new Pod and see it in the table', async function () {
        // New Pod
        await newPodSetup('A_test_Pod', 1500, true, 'vENM');
        // Verify
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"A_test_Pod")]')), 10000);
        // Delete
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod', 'Delete', 'enabled-table');
      });

      it('should not create new Pod if any entries are invalid', async function () {
        // Try creating new Pod
        await driver.get(`${baseUrl}/pods/create`);
        await driver.wait(until.elementLocated(By.id('name')), 5000);
        await driver.findElement(By.id('name')).sendKeys('invalidName&');
        await driver.findElement(By.id('podLoadTolerance')).sendKeys('1500');
        await driver.findElement(By.id('queueEnabled')).click();
        await driver.findElement(By.xpath('//option[contains(.,"Enabled")]')).click();
        await driver.findElement(By.id('vENM')).click();
        // Verify save button disabled
        (await driver.findElement(By.xpath('//button[contains(.,"Save")]')).getAttribute('disabled')).should.equal('true');
      });
    });

    describe('Deployments', async function () {
      it('should create new Deployment and see it in the Pods active table', async function () {
        // new Pod
        await newPodSetup('A_test_Pod2', 45, true, 'vENM');
        // Verify
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"A_test_Pod2")]')), 10000);
        // new Deployment
        var testDeployment = await createDeploymentREST('test_depl', 'A_test_Pod2', 'vENM');
        // Verify Deployment is in Active Table
        await verifyDeploymentInTable('A_test_Pod2', 'test_depl', 'active-deployments')
        // Delete Deployment
        await deleteDeploymentREST(testDeployment.newDeployment._id);
        // Delete Pod
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'Delete', 'enabled-table');
      });

      it('should create new Deployment and see it in the Pods queued table', async function () {
        // new Pod
        await newPodSetup('A_test_Pod2', 45, true, 'vENM');
        // Verify
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"A_test_Pod2")]')), 10000);
        // new Deployment 1
        var testDeployment = await createDeploymentREST('test_depl', 'A_test_Pod2', 'vENM');
        // new Deployment 2
        var testDeployment2 = await createDeploymentREST('test_depl2', 'A_test_Pod2', 'vENM');
        // new Deployment 3
        var testDeployment3 = await createDeploymentREST('test_depl3', 'A_test_Pod2', 'vENM');
        // new Deployment 4 (should be queued)
        var testDeployment4 = await createDeploymentREST('test_depl4', 'A_test_Pod2', 'vENM');
        // Verify Deployment 4 is in Queued Table
        await verifyDeploymentInTable('A_test_Pod2', 'test_depl4', 'queued-deployments')
        // Delete Deployments
        await deleteDeploymentREST(testDeployment.newDeployment._id);
        await deleteDeploymentREST(testDeployment2.newDeployment._id);
        await deleteDeploymentREST(testDeployment3.newDeployment._id);
        await deleteDeploymentREST(testDeployment4.newDeployment._id);
        // Delete Pod
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'Delete', 'enabled-table');
      });
    });
  });

  describe('Update', async function () {
    this.timeout(50000);
    this.retries(MAX_RETRIES);
    describe('Pods', async function () {
      it('should update Pod and see it in the table', async function () {
        // New Pod
        await newPodSetup('A_test_Pod', 1500, true, 'vENM');
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"A_test_Pod")]')), 10000);
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod', 'Edit', 'enabled-table');
        // Update
        await driver.wait(until.elementLocated(By.id('podLoadTolerance')), 5000);
        await driver.findElement(By.id('podLoadTolerance')).sendKeys('9');
        // Save
        var element = await driver.wait(until.elementLocated(By.xpath('//button[contains(.,"Save")]')), 5000);
        await element.click();
        await driver.sleep(1000);
        // Verify Update Successful
        await driver.wait(until.elementLocated(By.xpath('//h1[contains(.,"Viewing Pod: \'A_test_Pod\' ")]')), 5000);
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"15009")]')), 5000);
        // Delete
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod', 'Delete', 'enabled-table');
      });
    });

    describe('Configurations', async function () {
      it('should not update Configuration name', async function () {
        // Update Configuration name
        await performActionOnTableForObject('configurations', 'configurations/list', 'defaultConfig', 'Edit', 'configuration-table');
        await driver.findElement(By.id('name')).sendKeys('Updated');
        await clickElement(By.xpath('//button[contains(.,"Save")]', false));
        // Verify error message
        (await driver.findElement(By.xpath('//div[contains(.,"is immutable and cannot be modified")]')).isDisplayed()).should.equal(true);
      });

      it('should update Configuration', async function () {
        // Update Configuration
        await performActionOnTableForObject('configurations', 'configurations/list', 'defaultConfig', 'Edit', 'configuration-table');
        await driver.findElement(By.id('podDefaultLoadTolerance')).sendKeys('0');
        await clickElement(By.xpath('//button[contains(.,"Save")]', false));
        // Let All Pods Update after save
        await driver.sleep(5000);
        await performActionOnTableForObject('configurations', 'configurations/list', 'defaultConfig', 'View', 'configuration-table');
        // Verify Update
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"500")]')), 10000);
      });

      it('should update Configuration with new Product then successfully remove it', async function () {
        // Update Configuration
        await performActionOnTableForObject('configurations', 'configurations/list', 'defaultConfig', 'Edit', 'configuration-table');
        await clickElement(By.id('add-product', false));
        await driver.findElement(By.name('product[3]')).sendKeys('newProduct');
        await clickElement(By.xpath('//button[contains(.,"Save")]', false));
        // Let All Pods Update after save
        await driver.sleep(5000);
        // Verify Product Types contains newProduct
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"newProduct")]')), 10000);
        // Update Configuration
        await performActionOnTableForObject('configurations', 'configurations/list', 'defaultConfig', 'Edit', 'configuration-table');
        await driver.findElement(By.id('remove-product[3]')).click();
        await driver.switchTo().alert().accept();
        await clickElement(By.xpath('//button[contains(.,"Save")]', false));
        // Let All Pods Update after save
        await driver.sleep(5000);
        var productsString = await driver.findElement(By.xpath('//td[contains(.,"vENM")]')).getAttribute('innerHTML');
        productsString.includes('newProduct').should.equal(false)
      });
    });

    describe('Deployments', async function () {
      it('should update \'active\' Deployment to \'finished\' status and see it in the Pods finished table', async function () {
        // new Pod
        await newPodSetup('A_test_Pod2', 45, true, 'vENM');
        // Verify
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"A_test_Pod2")]')), 10000);
        // new Deployment
        var testDeployment = await createDeploymentREST('test_depl', 'A_test_Pod2', 'vENM');
        // Verify Deployment is in Active Table
        await verifyDeploymentInTable('A_test_Pod2', 'test_depl', 'active-deployments');
        // Edit status
        await changeDeploymentStatus('test_depl', 'Finished', 'active');
        // Verify Deployment is in Finished Table
        await verifyDeploymentInTable('A_test_Pod2', 'test_depl', 'finished-deployments');
        // Delete Deployment
        await deleteDeploymentREST(testDeployment.newDeployment._id);
        // Delete Pod
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'Delete', 'enabled-table');
      });

      it('should update \'active\' Deployment to \'timed-out\' status and see it in the Pods finished table', async function () {
        // new Pod
        await newPodSetup('A_test_Pod2', 45, true, 'vENM');
        // Verify
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"A_test_Pod2")]')), 10000);
        // new Deployment
        var testDeployment = await createDeploymentREST('test_depl', 'A_test_Pod2', 'vENM');
        // Verify Deployment is in Active Table
        await verifyDeploymentInTable('A_test_Pod2', 'test_depl', 'active-deployments');
        // Edit status
        await changeDeploymentStatus('test_depl', 'Timed-Out', 'active');
        // Verify Deployment is in Finished Table
        await verifyDeploymentInTable('A_test_Pod2', 'test_depl', 'finished-deployments');
        // Delete Deployment
        await deleteDeploymentREST(testDeployment.newDeployment._id);
        // Delete Pod
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'Delete', 'enabled-table');
      });

      it('should update \'active\' Deployment to \'failed\' status and see it in the Pods finished table', async function () {
        // new Pod
        await newPodSetup('A_test_Pod2', 45, true, 'vENM');
        // Verify
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"A_test_Pod2")]')), 10000);
        // new Deployment
        var testDeployment = await createDeploymentREST('test_depl', 'A_test_Pod2', 'vENM');
        // Verify Deployment is in Active Table
        await verifyDeploymentInTable('A_test_Pod2', 'test_depl', 'active-deployments');
        // Edit status
        await changeDeploymentStatus('test_depl', 'Failed', 'active');
        // Verify Deployment is in Finished Table
        await verifyDeploymentInTable('A_test_Pod2', 'test_depl', 'finished-deployments');
        // Delete Deployment
        await deleteDeploymentREST(testDeployment.newDeployment._id);
        // Delete Pod
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'Delete', 'enabled-table');
      });

      it('should update \'queued\' Deployment to \'finished\' status and see it in the Pods finished table', async function () {
        // new Pod
        await newPodSetup('A_test_Pod2', 45, true, 'vENM');
        // Verify
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"A_test_Pod2")]')), 10000);
        // new Deployment
        var testDeployment = await createDeploymentREST('test_depl', 'A_test_Pod2', 'vENM');
        // new Deployment 2
        var testDeployment2 = await createDeploymentREST('test_depl2', 'A_test_Pod2', 'vENM');
        // new Deployment 3
        var testDeployment3 = await createDeploymentREST('test_depl3', 'A_test_Pod2', 'vENM');
        // new Deployment 4 (should be queued)
        var testDeployment4 = await createDeploymentREST('test_depl4', 'A_test_Pod2', 'vENM');
        // Verify Deployment is in Queued Table
        await verifyDeploymentInTable('A_test_Pod2', 'test_depl4', 'queued-deployments');
        // Edit status
        await changeDeploymentStatus('test_depl4', 'Finished', 'queued');
        // Verify Deployment is in Finished Table
        await verifyDeploymentInTable('A_test_Pod2', 'test_depl4', 'finished-deployments');
        // Delete Deployments
        await deleteDeploymentREST(testDeployment.newDeployment._id);
        await deleteDeploymentREST(testDeployment2.newDeployment._id);
        await deleteDeploymentREST(testDeployment3.newDeployment._id);
        await deleteDeploymentREST(testDeployment4.newDeployment._id);
        // Delete Pod
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'Delete', 'enabled-table');
      });

      it('should update \'queued\' Deployment to \'timed-out\' status and see it in the Pods finished table', async function () {
        // new Pod
        await newPodSetup('A_test_Pod2', 45, true, 'vENM');
        // Verify
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"A_test_Pod2")]')), 10000);
        // new Deployment
        var testDeployment = await createDeploymentREST('test_depl', 'A_test_Pod2', 'vENM');
        // new Deployment 2
        var testDeployment2 = await createDeploymentREST('test_depl2', 'A_test_Pod2', 'vENM');
        // new Deployment 3
        var testDeployment3 = await createDeploymentREST('test_depl3', 'A_test_Pod2', 'vENM');
        // new Deployment 4 (should be queued)
        var testDeployment4 = await createDeploymentREST('test_depl4', 'A_test_Pod2', 'vENM');
        // Verify Deployment is in Queued Table
        await verifyDeploymentInTable('A_test_Pod2', 'test_depl4', 'queued-deployments');
        // Edit status
        await changeDeploymentStatus('test_depl4', 'Timed-Out', 'queued');
        // Verify Deployment is in Finished Table
        await verifyDeploymentInTable('A_test_Pod2', 'test_depl4', 'finished-deployments');
        // Delete Deployments
        await deleteDeploymentREST(testDeployment.newDeployment._id);
        await deleteDeploymentREST(testDeployment2.newDeployment._id);
        await deleteDeploymentREST(testDeployment3.newDeployment._id);
        await deleteDeploymentREST(testDeployment4.newDeployment._id);
        // Delete Pod
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'Delete', 'enabled-table');
      });

      it('should update \'queued\' Deployment to \'failed\' status and see it in the Pods finished table', async function () {
        // new Pod
        await newPodSetup('A_test_Pod2', 45, true, 'vENM');
        // Verify
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"A_test_Pod2")]')), 10000);
        // new Deployment
        var testDeployment = await createDeploymentREST('test_depl', 'A_test_Pod2', 'vENM');
        // new Deployment 2
        var testDeployment2 = await createDeploymentREST('test_depl2', 'A_test_Pod2', 'vENM');
        // new Deployment 3
        var testDeployment3 = await createDeploymentREST('test_depl3', 'A_test_Pod2', 'vENM');
        // new Deployment 4 (should be queued)
        var testDeployment4 = await createDeploymentREST('test_depl4', 'A_test_Pod2', 'vENM');
        // Verify Deployment is in Queued Table
        await verifyDeploymentInTable('A_test_Pod2', 'test_depl4', 'queued-deployments');
        // Edit status
        await changeDeploymentStatus('test_depl4', 'Failed', 'queued');
        // Verify Deployment is in Finished Table
        await verifyDeploymentInTable('A_test_Pod2', 'test_depl4', 'finished-deployments');
        // Delete Deployments
        await deleteDeploymentREST(testDeployment.newDeployment._id);
        await deleteDeploymentREST(testDeployment2.newDeployment._id);
        await deleteDeploymentREST(testDeployment3.newDeployment._id);
        await deleteDeploymentREST(testDeployment4.newDeployment._id);
        // Delete Pod
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'Delete', 'enabled-table');
      });
    });
  });

  describe('Delete', async function () {
    this.timeout(30000);
    this.retries(MAX_RETRIES);
    describe('Admin', async function () {
      it('should remove User from being admin', async function () {
        // Remove
        await performActionOnTableForObject('admins', 'users/list', 'eistpav', 'Remove', 'users-table');
        // Verify message
        (await driver.findElement(By.xpath('//div[contains(.,"is no longer an admin user!")]')).isDisplayed()).should.equal(true);
      });

      it('should not remove loggedInUser from being admin', async function () {
        // Get remove button xpath
        await driver.get(`${baseUrl}users/list`);
        var rowXPath = await getRowXPathFromTable('users/list', testUsername);
        var deleteButton = rowXPath + 'td[contains(.,"Remove")]/a[contains(.,"Remove")]';
        // Verify no delete button visible by xpath
        (await driver.findElement(By.xpath(deleteButton)).isDisplayed()).should.equal(false);
      });
    });

    describe('Pods', async function () {
      it('should remove Pod', async function () {
        // New Pod
        await newPodSetup('A_test_Pod', 1500, true, 'vENM');
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"A_test_Pod")]')), 10000);
        // Delete
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod', 'Delete', 'enabled-table');
        // Verify
        await driver.wait(until.elementLocated(By.xpath('//div[contains(.,"deleted successfully!")]')), 5000);
      });

      it('should not remove Pod if it has dependent deployment', async function () {
        // New Pod
        await newPodSetup('A_test_Pod2', 1500, true, 'vENM');
        await driver.wait(until.elementLocated(By.xpath('//td[contains(.,"A_test_Pod2")]')), 10000);
        // view Pod
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'View', 'enabled-table');
        // new Deployment
        var testDeployment = await createDeploymentREST('test_depl', 'A_test_Pod2', 'vENM');
        // Edit status
        await changeDeploymentStatus('test_depl', 'Failed', 'active');
        // try Delete Pod
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'Delete', 'enabled-table');
        // Verify
        await driver.wait(until.elementLocated(By.xpath('//div[contains(.,"has dependant Deployments")]')), 5000);
        // Delete Deployment
        await deleteDeploymentREST(testDeployment.newDeployment._id);
        // Delete Pod
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'Delete', 'enabled-table');
      });
    });

    describe('Deployments', async function () {
      it('should delete deployment from finished deployments list', async function () {
        // new Pod
        await newPodSetup('A_test_Pod2', 45, true, 'vENM');
        // view Pod
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'View', 'enabled-table');
        var podId = await getIdFromCurrentURL();
        // new Deployment
        await createDeploymentREST('test_depl', 'A_test_Pod2', 'vENM');
        // Edit status
        await changeDeploymentStatus('test_depl', 'Failed', 'active');
        // delete Deployment
        await performActionOnTableForObject('deployments', `pods/view/${podId}`, 'test_depl', 'Delete', 'finished-deployments');
        // Verify
        await driver.wait(until.elementLocated(By.xpath('//div[contains(.,"deletion successful!")]')), 5000);
        // Delete Pod
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'Delete', 'enabled-table');
      });

      it('should delete all deployment using \'Delete All Deployments\' button in pod view page', async function () {
        // new Pod
        await newPodSetup('A_test_Pod2', 45, true, 'vENM');
        // view Pod
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'View', 'enabled-table');
        // new Deployment
        await createDeploymentREST('test_depl', 'A_test_Pod2', 'vENM');
        // Edit status
        await changeDeploymentStatus('test_depl', 'Failed', 'active');
        // try delete Deployment
        await clickElement(By.xpath('//button[contains(.,"Delete All Deployments")]'), 'Delete');
        // Verify
        await driver.wait(until.elementLocated(By.xpath('//div[contains(.,"Deleted All Deployments successfully!")]')), 5000);
        // Delete
        await performActionOnTableForObject('pods', 'pods/list', 'A_test_Pod2', 'Delete', 'enabled-table');
      });
    });
  });

  afterEach(async function () {
    if (this.currentTest.state === 'failed') {
      var failedTestTitle = this.currentTest.title.replace(/ /g, '_');
      await takeScreenshot(failedTestTitle);
    }
  });
});
