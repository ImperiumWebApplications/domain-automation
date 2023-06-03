#!/bin/bash

error_handler()
{
  echo "Error: ($?) $1"
  exit 1
}

getDomains() {
  # Fetch all domains from your RDS instance
  mysql -u USERNAME -pPASSWORD -h HOSTNAME -e "SELECT name FROM domains" DATABASE_NAME
}

for DOMAIN in $(getDomains); do
  # Register the domain
  aws route53domains register-domain --domain-name $DOMAIN --duration-in-years 1 --admin-contact '{"FirstName":"John","LastName":"Doe","ContactType":"PERSON","OrganizationName":"TestOrg","AddressLine1":"123 Test St","City":"TestCity","State":"TX","CountryCode":"US","ZipCode":"12345","PhoneNumber":"+1.1234567890","Email":"test@example.com"}' --registrant-contact '{"FirstName":"John","LastName":"Doe","ContactType":"PERSON","OrganizationName":"TestOrg","AddressLine1":"123 Test St","City":"TestCity","State":"TX","CountryCode":"US","ZipCode":"12345","PhoneNumber":"+1.1234567890","Email":"test@example.com"}' --tech-contact '{"FirstName":"John","LastName":"Doe","ContactType":"PERSON","OrganizationName":"TestOrg","AddressLine1":"123 Test St","City":"TestCity","State":"TX","CountryCode":"US","ZipCode":"12345","PhoneNumber":"+1.1234567890","Email":"test@example.com"}' || error_handler "Domain registration failed for $DOMAIN, Line: ${LINENO}"

  # Wait for the domain to be registered
  while true; do
    DOMAIN_STATUS=$(aws route53domains get-domain-detail --domain-name $DOMAIN --query 'Status' --output text)
    if [ "$DOMAIN_STATUS" = "REGISTERED" ]; then
        break
    fi
    sleep 300
  done

  # Add the domain to the available_domains table
  mysql -u USERNAME -pPASSWORD -h HOSTNAME -e "INSERT INTO available_domains (name) VALUES ('${DOMAIN}')" DATABASE_NAME || error_handler "Inserting domain into available_domains failed for $DOMAIN, Line: ${LINENO}"

  # Delete the domain from the domains table
  mysql -u USERNAME -pPASSWORD -h HOSTNAME -e "DELETE FROM domains WHERE name = '${DOMAIN}'" DATABASE_NAME || error_handler "Deleting domain from domains table failed for $DOMAIN, Line: ${LINENO}"
done

  HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name $DOMAIN --max-items 1 --query 'HostedZones[0].Id' --output text)

  LOAD_BALANCER="load-balancer-arn"

  # Create A record
  aws route53 change-resource-record-sets --hosted-zone-id $HOSTED_ZONE_ID --change-batch "{\"Changes\": [{\"Action\": \"CREATE\", \"ResourceRecordSet\": {\"Name\": \"$DOMAIN.\", \"Type\": \"A\", \"AliasTarget\": {\"HostedZoneId\": \"$HOSTED_ZONE_ID\", \"DNSName\": \"$LOAD_BALANCER\", \"EvaluateTargetHealth\": false}}}]}" 

  # Request SSL certificate
  CERTIFICATE_ARN=$(aws acm request-certificate --domain-name $DOMAIN --validation-method DNS --query 'CertificateArn' --output text)

  # Get DNS Validation CNAME
  DNS_VALIDATION_CNAME=$(aws acm describe-certificate --certificate-arn $CERTIFICATE_ARN --query 'Certificate.DomainValidationOptions[0].ResourceRecord' --output json)
  NAME=$(echo $DNS_VALIDATION_CNAME | jq -r '.Name')
  VALUE=$(echo $DNS_VALIDATION_CNAME | jq -r '.Value')

  # Add CNAME to Route 53 for ACM DNS validation
  aws route53 change-resource-record-sets --hosted-zone-id $HOSTED_ZONE_ID --change-batch "{\"Changes\": [{\"Action\": \"CREATE\", \"ResourceRecordSet\": {\"Name\": \"$NAME\", \"Type\": \"CNAME\", \"TTL\": 300, \"ResourceRecords\": [{\"Value\": \"$VALUE\"}]}}]}"

  # Wait for ACM to validate the certificate
  while true; do
    CERTIFICATE_STATUS=$(aws acm describe-certificate --certificate-arn $CERTIFICATE_ARN --query 'Certificate.Status' --output text)
    if [ "$CERTIFICATE_STATUS" = "ISSUED" ]; then
        break
    fi
    sleep 300
  done

done
