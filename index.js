const cron = require("node-cron");
const mysql = require("mysql2/promise");
const AWS = require("aws-sdk");
const {
  checkAvailablityAndRegisterDomain,
  configureARecord,
  requestAndAssociateCertificate,
} = require("./domainAutomation");

const loadBalancerDNSName =
  "awseb-AWSEB-1HPC61L8II71Y-1353296702.eu-central-1.elb.amazonaws.com";
const loadBalancerArn =
  "arn:aws:elasticloadbalancing:eu-central-1:365257514961:loadbalancer/app/awseb-AWSEB-1HPC61L8II71Y/6d87f22d4a8944a7";

const secretsManager = new AWS.SecretsManager({
  region: "eu-central-1",
});

const getDbCredentials = async () => {
  const secretData = await secretsManager
    .getSecretValue({
      SecretId: "domainAutomation/databaseCredentials",
    })
    .promise();

  return JSON.parse(secretData.SecretString);
};

const runSequentially = async (domainName) => {
  try {
    await checkAvailablityAndRegisterDomain(domainName);
    await configureARecord(domainName, loadBalancerDNSName);
    await requestAndAssociateCertificate(domainName, loadBalancerArn);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

const processDomainNames = async () => {
  const dbCredentials = await getDbCredentials();
  const connection = await mysql.createConnection(dbCredentials);
  const [rows] = await connection.execute("SELECT * FROM domains_processing");
  for (let row of rows) {
    const domainName = row.domain_name;
    const success = await runSequentially(domainName);
    if (success) {
      await connection.execute(
        "DELETE FROM domains_processing WHERE domain_name = ?",
        [domainName]
      );
    }
  }
  await connection.end();
};

cron.schedule("* * * * *", processDomainNames);
